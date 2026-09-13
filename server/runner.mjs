import {randomUUID} from 'node:crypto';
import {signal,regime,correlation,positionPlan,openPosition,applyFunding,manageQuote,closePosition,snapshot,entryBlocks} from '../core/engine.mjs';
import * as market from './market.mjs';
async function protect(a,now) {
  const results=await Promise.allSettled(a.positions.map(async p=>{const [q,rates]=await Promise.all([market.quote(p.symbol),market.funding(p.symbol,p.lastFunding+1,now)]);return {id:p.id,q,rates};}));
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
export async function tick(a) {
  const started=Date.now();if(a.lastRun&&started-a.lastRun<45000)throw Error('Yeni tarama için önceki taramadan en az 45 saniye geçmeli.');
  a.lastRun=started;
  try {
    await protect(a,started);
    if(entryBlocks(a,started).length){a.lastError=null;a.status=entryBlocks(a,started).join(' · ');return;}
    if(Date.now()-started>14000)throw Error('Koruma tamamlandı; tarama sonraki tura bırakıldı.');
    const list=await market.universe(a.settings);if(!list.length)throw Error('Kalite filtresini geçen sözleşme yok.');
    const batch=[list[a.scanCursor%list.length],list[(a.scanCursor+1)%list.length]].filter((x,i,arr)=>arr.findIndex(y=>y.symbol===x.symbol)===i);
    a.scanCursor=(a.scanCursor+batch.length)%list.length;
    const symbols=[...new Set(['BTCUSDT',...batch.map(x=>x.symbol),...a.positions.map(x=>x.symbol)])];
    const histories=await Promise.all(symbols.map(async s=>[s,await market.candles(s)]));const cm=new Map(histories);
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
      const c=candidates[0],q=await market.quote(c.meta.symbol);
      const plan=positionPlan(a,c.sig,q,c.meta,Date.now(),c.scale);
      c.record.reasons=plan.reasons;
      if(plan.accepted&&a.settings.auto){openPosition(a,plan,randomUUID());c.record.action='ACILDI';}
      else if(plan.accepted){c.record.action='UYGUN';c.record.reasons=['Otomatik işlem kapalı'];}
    }
    a.signals=a.signals.slice(-100);a.lastError=null;a.status=`${batch.length} coin incelendi · ${list.length} uygun sözleşme`;
  }catch(e){a.lastError=e.message;a.status='Veri/çalıştırma sorunu; yeni işlem açılmadı';}
  snapshot(a,Date.now());
}
