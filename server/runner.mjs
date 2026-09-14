import {randomUUID} from 'node:crypto';
import {signal,regime,correlation,positionPlan,openPosition,createPendingEntry,observePendingEntry,pendingConfirmationReasons,applyFunding,manageQuote,closePosition,snapshot,entryBlocks,PULLBACK_ENTRY} from '../core/engine.mjs';
import * as market from './market.mjs';
import {shouldCheck,scheduleSuccess,scheduleFailure} from '../public/automation.js';
async function protect(a,now,provider=market) {
  const results=await Promise.allSettled(a.positions.map(async p=>{const [q,rates]=await Promise.all([provider.quote(p.symbol),provider.funding(p.symbol,p.lastFunding+1,now)]);return {id:p.id,q,rates};}));
  for(const result of results){if(result.status!=='fulfilled')continue;const r=result.value,p=a.positions.find(x=>x.id===r.id);applyFunding(a,p,r.rates,now);manageQuote(a,p,r.q,now);}
  snapshot(a,now);
  if(results.some(r=>r.status==='rejected'))throw Error('Bazı açık pozisyonların verisi alınamadı; doğrulanabilen pozisyonlar yönetildi, yeni işlem engellendi.');
}
export async function closeManual(a,id) {
  const p=a.positions.find(x=>x.id===id);if(!p){const t=a.trades.find(x=>x.id===id);if(t)return t;throw Error('Açık pozisyon bulunamadı.');}
  const now=Date.now();const [q,rates]=await Promise.all([market.quote(p.symbol),market.funding(p.symbol,p.lastFunding+1,now)]);
  applyFunding(a,p,rates,now);
  // A liquidation/stop already crossed at the observed quote retains that reason.
  const protectedExit=manageQuote(a,p,q,now);
  const trade=protectedExit||closePosition(a,id,p.side===1?q.bid:q.ask,'MANUEL',now);snapshot(a,now);return trade;
}
async function reviewPending(a,started,provider=market) {
  a.pendingEntries=(a.pendingEntries||[]).filter(p=>!a.positions.some(x=>x.symbol===p.symbol));
  const expired=a.pendingEntries.filter(p=>started>=p.expiresAt);
  for(const p of expired)a.signals.push({symbol:p.symbol,side:p.side,score:p.signal.score,count:p.signal.count,time:started,action:'IPTAL',reasons:['Geri çekilme bekleme süresi doldu']});
  a.pendingEntries=a.pendingEntries.filter(p=>started<p.expiresAt);
  if(!a.pendingEntries.length)return false;
  const symbols=[...new Set(['BTCUSDT',...a.pendingEntries.map(p=>p.symbol),...a.positions.map(p=>p.symbol)])];
  const [histories,quotes]=await Promise.all([
    Promise.all(symbols.map(async s=>[s,await provider.candles(s)])),
    Promise.all(a.pendingEntries.map(async p=>[p.symbol,await provider.quote(p.symbol)]))
  ]);
  const cm=new Map(histories),qm=new Map(quotes);
  for(const rows of cm.values())if(!rows.length||Date.now()-rows.at(-1).end>17*60000)throw Error('Kapanmış mum verisi güncel değil.');
  const globalRegime=regime(cm.get('BTCUSDT'));a.regime=globalRegime;
  let opened=false;const keep=[];
  for(const p of a.pendingEntries) {
    const q=qm.get(p.symbol),decision=observePendingEntry(p,q.mark,Date.now());
    const record={symbol:p.symbol,side:p.side,score:p.signal.score,count:p.signal.count,time:Date.now(),action:'GERI_CEKILME',reasons:[decision.reason]};
    if(decision.action==='IPTAL'){record.action='IPTAL';a.signals.push(record);continue;}
    if(decision.action!=='HAZIR'||opened||!a.settings.auto){keep.push(p);a.signals.push(record);continue;}
    const current=signal(cm.get(p.symbol),a.settings),reasons=pendingConfirmationReasons(p,current,a.settings,globalRegime);
    let scale=p.scale;
    for(const position of a.positions){const corr=correlation(cm.get(p.symbol),cm.get(position.symbol));if(corr===null)reasons.push('Korelasyon verisi yetersiz');else if(corr*position.side*p.side>=.9)reasons.push(`${position.symbol} ile benzer yön riski`);else if(corr*position.side*p.side>=.75)scale=Math.min(scale,.5);}
    const confirmed={...current,side:p.side,reasons};const plan=positionPlan(a,confirmed,q,p.meta,Date.now(),scale);
    if(plan.accepted){openPosition(a,plan,randomUUID());record.action='ACILDI';record.reasons=['Geri çekilme ve toparlanma doğrulandı'];opened=true;}
    else {record.action='IPTAL';record.reasons=plan.reasons;}
    a.signals.push(record);
  }
  a.pendingEntries=keep.slice(0,PULLBACK_ENTRY.maxPending);a.signals=a.signals.slice(-100);
  a.status=opened?'Geri çekilme doğrulandı · sanal pozisyon açıldı':`${a.pendingEntries.length} fırsatta güvenli giriş bekleniyor`;
  return true;
}
export async function tick(a,provider=market) {
  const started=Date.now();if(!shouldCheck(a,started))return {skipped:true,nextCheckAt:a.nextScanAt||a.lastRun+60000};
  const entryRetryPending=started<(a.nextScanAt||0);
  a.lastRun=started;
  try {
    a.lastProtectionAt=started;
    await protect(a,started,provider);
    if(entryRetryPending){a.status='Açık pozisyonlar kontrol edildi; piyasa taraması yeniden deneme saatini bekliyor';return;}
    if(entryBlocks(a,started).length){a.lastError=null;a.status=entryBlocks(a,started).join(' · ');scheduleSuccess(a,started);return;}
    if(Date.now()-started>14000)throw Error('Koruma tamamlandı; tarama sonraki tura bırakıldı.');
    if(await reviewPending(a,started,provider)){a.lastError=null;scheduleSuccess(a,Date.now());return;}
    const list=await provider.universe(a.settings);if(!list.length)throw Error('Kalite filtresini geçen sözleşme yok.');
    const batch=[list[a.scanCursor%list.length],list[(a.scanCursor+1)%list.length]].filter((x,i,arr)=>arr.findIndex(y=>y.symbol===x.symbol)===i);
    a.scanCursor=(a.scanCursor+batch.length)%list.length;
    const symbols=[...new Set(['BTCUSDT',...batch.map(x=>x.symbol),...a.positions.map(x=>x.symbol)])];
    const histories=await Promise.all(symbols.map(async s=>[s,await provider.candles(s)]));const cm=new Map(histories);
    for(const rows of cm.values())if(!rows.length||Date.now()-rows.at(-1).end>17*60000)throw Error('Kapanmış mum verisi güncel değil.');
    const globalRegime=regime(cm.get('BTCUSDT'));a.regime=globalRegime;
    const candidates=[];
    for(const meta of batch) {
      const rows=cm.get(meta.symbol),sig=signal(rows,a.settings);let scale=1;
      if(globalRegime==='ASIRI_OYNAK')sig.reasons.push('Bitcoin aşırı oynaklık koruması');
      if(globalRegime==='YUKSELIS'&&sig.side===-1||globalRegime==='DUSUS'&&sig.side===1)sig.reasons.push('Bitcoin piyasa yönüyle çatışma');
      for(const p of a.positions) {
        const corr=correlation(rows,cm.get(p.symbol));
        if(corr===null){sig.reasons.push('Korelasyon verisi yetersiz');continue;}
        const exposureCorr=corr*p.side*sig.side;
        if(exposureCorr>=0.9)sig.reasons.push(`${p.symbol} ile benzer yön riski`);else if(exposureCorr>=0.75)scale=Math.min(scale,0.5);
      }
      const record={...sig,symbol:meta.symbol,time:Date.now(),action:'BEKLE',reasons:[...sig.reasons]};
      if(!sig.reasons.length)candidates.push({meta,sig,scale,record});
      a.signals.push(record);
    }
    candidates.sort((x,y)=>y.sig.score-x.sig.score);
    if(candidates.length&&Date.now()-started<24000) {
      const c=candidates[0],q=await provider.quote(c.meta.symbol);
      const plan=positionPlan(a,c.sig,q,c.meta,Date.now(),c.scale);
      c.record.reasons=plan.reasons;
      if(plan.accepted&&a.settings.auto){
        a.pendingEntries??=[];
        if(!a.pendingEntries.some(p=>p.symbol===c.meta.symbol)&&a.pendingEntries.length<PULLBACK_ENTRY.maxPending){a.pendingEntries.push(createPendingEntry(c.sig,c.meta,Date.now(),c.scale));c.record.action='GERI_CEKILME';c.record.reasons=['Geri çekilme ve toparlanma bekleniyor'];}
      }
      else if(plan.accepted){c.record.action='UYGUN';c.record.reasons=['Otomatik işlem kapalı'];}
    }
    a.signals=a.signals.slice(-100);a.lastError=null;a.status=`${batch.length} coin incelendi · ${list.length} uygun sözleşme`;scheduleSuccess(a,Date.now());
  }catch(e){a.lastError=e.message;a.status='Veri/çalıştırma sorunu; otomatik yeniden deneme bekleniyor';scheduleFailure(a,Date.now());}
  snapshot(a,Date.now());
}
