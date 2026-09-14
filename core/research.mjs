import {initialState,signal,positionPlan,openPosition,createPendingEntry,observePendingEntry,pendingConfirmationReasons,closePosition,applyFunding,grossPnl,liquidationPrice,updateProfitProtection,snapshot,STRATEGIES,round} from './engine.mjs';
// Historical candles are processed chronologically. A close signal fills at
// the NEXT candle open, never at the close that generated that signal.
export function replay(rows,marks,rates,settings,meta,{start=65,end=rows.length,disabled=null,profitProtection=true}={}) {
  if(rows.length<100||marks.length<100)throw Error('Geçmiş test için veri yetersiz.');
  const mm=new Map(marks.map(x=>[x.t,x]));
  let previous=0;for(const row of rows){if(!mm.has(row.t)||(previous&&row.t-previous!==900000))throw Error('Geçmiş testte eksik mum var.');previous=row.t;}
  const a=initialState(rows[0].t);a.settings={...settings,auto:true,paused:false};let fees=0,tradeCount=0,wins=0,profits=0,losses=0,maxDd=0,peak=1000,net=0;
  const trades=[];let pending=null;
  for(let i=start;i<end;i++) {
    const bar=rows[i],mark=mm.get(bar.t);let p=a.positions[0];const current=signal(rows.slice(Math.max(0,i-160),i),settings,disabled);
    if(!p) {
      const q={mark:mark.o,bid:bar.o*(1-0.0001),ask:bar.o*(1+0.0001),time:bar.t};
      if(pending){const decision=observePendingEntry(pending,q.mark,bar.t);if(decision.action==='IPTAL')pending=null;else if(decision.action==='HAZIR'){const confirmed={...current,side:pending.side,reasons:pendingConfirmationReasons(pending,current,settings)};const plan=positionPlan(a,confirmed,q,meta,bar.t);pending=null;if(plan.accepted)p=openPosition(a,plan,`bt-${bar.t}`);}}
      if(!p&&!pending&&current.accepted)pending=createPendingEntry(current,meta,bar.t);
    }
    if(p) {
      // Funding timestamps are real; ambiguous intrabar order is conservative:
      // debit a payable funding event before exits, credit only if still held at close.
      const due=rates.filter(x=>x.time>=bar.t&&x.time<=bar.end);
      applyFunding(a,p,due.filter(x=>-p.side*x.rate<0),bar.end);
      const liq=liquidationPrice(p);let reason=null,exit=0;
      if(p.side===1?mark.l<=liq:mark.h>=liq){reason='TASFIYE';exit=p.side===1?Math.min(bar.o,liq):Math.max(bar.o,liq);}
      else if(p.side===1?mark.l<=p.stop:mark.h>=p.stop){reason=p.protectionStage?'KAR_KORUMA':'ZARAR_DURDUR';exit=p.side===1?Math.min(bar.o,p.stop):Math.max(bar.o,p.stop);}
      else if(p.side===1?mark.h>=p.target:mark.l<=p.target){reason='KAR_AL';exit=p.target;}
      if(reason) {
        const t=closePosition(a,p.id,exit,reason,bar.end);trades.push(t);tradeCount++;fees+=t.fees;net+=t.net;
        if(t.net>0){wins++;profits+=t.net;}else losses-=t.net;
      }else{applyFunding(a,p,due,bar.end);if(profitProtection)updateProfitProtection(a,p,p.side===1?mark.h:mark.l,bar.end);p.mark=mark.c;p.markTime=bar.end;}
    }
    if(!a.positions[0]&&pending){let decision=observePendingEntry(pending,pending.side===1?mark.l:mark.h,bar.end-1);if(decision.action==='IPTAL')pending=null;else {decision=observePendingEntry(pending,mark.c,bar.end);if(decision.action==='IPTAL')pending=null;}}
    const eq=snapshot(a,bar.end);peak=Math.max(peak,eq);maxDd=Math.max(maxDd,(peak-eq)/peak*100);a.events=[];
  }
  if(a.positions[0]) {
    const t=closePosition(a,a.positions[0].id,rows[end-1].c,'TEST_SONU',rows[end-1].end);trades.push(t);tradeCount++;fees+=t.fees;net+=t.net;
    if(t.net>0){wins++;profits+=t.net;}else losses-=t.net;
  }
  peak=Math.max(peak,a.balance);maxDd=Math.max(maxDd,(peak-a.balance)/peak*100);
  return {finalBalance:a.balance,net:round(net),returnPct:round((a.balance/1000-1)*100),trades:tradeCount,winRate:tradeCount?wins/tradeCount*100:0,profitFactor:losses?profits/losses:null,maxDrawdownPct:maxDd,fees:round(fees),funding:round(trades.reduce((s,t)=>s+t.funding,0)),expectancy:tradeCount?net/tradeCount:0,curve:a.curve,detail:trades};
}
const compact=r=>({...r,detail:r.detail.slice(-20),curve:r.curve.filter((_,i)=>i%4===0)});
export function laboratory(rows,marks,rates,settings,meta) {
  const baseline=replay(rows,marks,rates,settings,meta);
  const staticExit=replay(rows,marks,rates,settings,meta,{profitProtection:false});
  // Three expanding train windows with disjoint subsequent test windows.
  const initial=Math.floor(rows.length*.5),step=Math.floor((rows.length-initial)/3),folds=[];
  for(let k=0;k<3;k++) {
    const split=initial+k*step,end=k===2?rows.length:split+step;
    const grid=[];
    for(const atrMult of [1.5,2,2.5])for(const rewardRisk of [1.5,2,2.5]) {
      const p={...settings,atrMult,rewardRisk};const r=replay(rows.slice(0,split),marks,rates,p,meta);
      grid.push({parameters:{atrMult,rewardRisk},trainTrades:r.trades,objective:r.trades>=5?r.returnPct-r.maxDrawdownPct:-1e9});
    }
    grid.sort((a,b)=>b.objective-a.objective);
    const chosen=grid[0].trainTrades>=5?{...settings,...grid[0].parameters}:settings;
    const validation=replay(rows,marks,rates,chosen,meta,{start:split,end});
    folds.push({trainEnd:rows[split-1].end,testStart:rows[split].t,testEnd:rows[end-1].end,parameters:{atrMult:chosen.atrMult,rewardRisk:chosen.rewardRisk},sampleAdequate:grid[0].trainTrades>=5,ranking:grid.slice(0,3),validation:compact(validation)});
  }
  const contribution=STRATEGIES.map(name=>{const without=replay(rows,marks,rates,settings,meta,{disabled:name});return {strategy:name,withoutNet:without.net,contribution:round(baseline.net-without.net),tradesWithout:without.trades};});
  return {symbol:meta.symbol,candleCount:rows.length,from:rows[65].t,to:rows.at(-1).end,parameters:settings,baseline:compact(baseline),exitComparison:{protected:compact(baseline),static:compact(staticExit)},folds,contribution,
    limitations:['Tek coin testi; coinler arası portföy ve korelasyon testi değildir.','Evren bugünkü sözleşmelerden seçilir; geçmişte kapanmış sözleşmeler kapsanmaz.','Tasfiye, sabit bakım teminatı oranıyla yaklaşık modellenir; Binance hesap sonucu değildir.','Geçmiş emir defteri yok: her yönde 1 baz puan alış-satış farkı varsayılır.','Mum içi sıralama bilinmediğinde tasfiye/önceki stop önceliklidir; yeni kâr koruma seviyesi sonraki mumda geçerli olur.','Her doğrulama penceresi ayrı 1.000 USDT ile başlar; sonuçlar tek portföy eğrisi gibi toplanmaz.','Optimizasyon sonuçları otomatik olarak ayarlara uygulanmaz.']};
}
