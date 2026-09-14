// V2: only simulated, isolated-margin, USDT-linear perpetual positions.
// No network or database code belongs in this module.
export const VERSION = '0.1.0';
export const DEFAULTS = Object.freeze({auto:false, paused:false, leverage:5, riskPct:0.5,
  dailyLossPct:3, maxDrawdownPct:8, maxOpenRiskPct:2, maxMarginPct:20, maxPositions:3,
  minScore:80, minVotes:3, atrMult:2, rewardRisk:2, feeRate:0.0005, slippageBps:5,
  maintenanceRate:0.01, maxSpreadBps:8, minVolume:20000000, cooldownMinutes:60});
export const STRATEGIES = ['trend','momentum','breakout','pullback'];
export const PROFIT_PROTECTION = Object.freeze({costTriggerR:0.75,trailTriggerR:1,trailDistanceR:0.5,minLockR:0.25});
export const PULLBACK_ENTRY = Object.freeze({offsetATR:0.3,invalidationATR:1.2,reboundATR:0.12,expiresMs:45*60000,maxPending:3});
export const STABLE = new Set(['USDT','USDC','FDUSD','TUSD','USDP','DAI','BUSD','USD1','U','USDE','USDS','PYUSD','GUSD','USDD','FRAX','LUSD','USD0','USTC','RLUSD','AEUR','EURI','XUSD','AUSD','BFUSD','USDX','EUR','TRY','BRL','GBP','AUD','USDD1','USDF']);
export const round = x => Math.round((x + Number.EPSILON) * 1e8) / 1e8;
export const mean = a => a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function initialState(now=Date.now()) {return {version:VERSION,balance:1000,peak:1000,day:dayKey(now),dayStartEquity:1000,settingsVersion:0,settings:{...DEFAULTS},positions:[],pendingEntries:[],trades:[],events:[],signals:[],curve:[],scanCursor:0,lastRun:null,lastError:null,circuit:null};}
export function dayKey(t) {return new Date(t+3*3600000).toISOString().slice(0,10);}
export function eligible(s) {return s?.status==='TRADING'&&s.contractType==='PERPETUAL'&&s.quoteAsset==='USDT'&&s.marginAsset==='USDT'&&!STABLE.has(s.baseAsset)&&!/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset);}
export function validateSettings(old,patch) {
  if(!patch||Array.isArray(patch)||typeof patch!=='object')throw Error('Geçersiz ayarlar.');
  const ranges={leverage:[1,50],riskPct:[0.1,2],dailyLossPct:[0.5,10],maxDrawdownPct:[1,30],maxOpenRiskPct:[0.5,5],maxMarginPct:[1,30],maxPositions:[1,5],minScore:[80,100],minVotes:[2,4],atrMult:[1,4],rewardRisk:[1.5,4],feeRate:[0.0001,0.003],slippageBps:[1,50],maintenanceRate:[0.01,0.05],maxSpreadBps:[1,20],minVolume:[10000000,1000000000],cooldownMinutes:[15,1440]};
  for(const [k,v] of Object.entries(patch)) {
    if(k==='auto'||k==='paused'){if(typeof v!=='boolean')throw Error('Geçersiz anahtar.');continue;}
    const r=Object.hasOwn(ranges,k)?ranges[k]:null; if(!r||typeof v!=='number'||!Number.isFinite(v)||v<r[0]||v>r[1])throw Error(`Geçersiz ayar: ${k}`);
    if(['leverage','maxPositions','minVotes','cooldownMinutes'].includes(k)&&!Number.isInteger(v))throw Error('Tam sayı gerekli.');
  }
  return {...old,...patch};
}
export function ema(values,n) {let v=values[0]; for(const x of values.slice(1))v+=2/(n+1)*(x-v);return v;}
export function features(rows) {
  if(rows.length<60)throw Error('En az 60 kapanmış mum gerekli.');
  const c=rows.map(x=>x.c), last=c.at(-1), e9=ema(c,9), e21=ema(c,21), e50=ema(c,50);
  let gain=0,loss=0,tr=0;
  for(let i=c.length-14;i<c.length;i++){const d=c[i]-c[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);tr+=Math.max(rows[i].h-rows[i].l,Math.abs(rows[i].h-c[i-1]),Math.abs(rows[i].l-c[i-1]));}
  const rsi=loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  return {last,e9,e21,e50,rsi,atr:tr/14,volumeRatio:rows.at(-1).v/Math.max(1e-12,mean(rows.slice(-21,-1).map(x=>x.v))),momentum:last/c.at(-6)-1,high:Math.max(...rows.slice(-21,-1).map(x=>x.h)),low:Math.min(...rows.slice(-21,-1).map(x=>x.l))};
}
export function regime(rows) {const f=features(rows);if(f.atr/f.last>0.035)return 'ASIRI_OYNAK';return f.e9>f.e21&&f.e21>f.e50?'YUKSELIS':f.e9<f.e21&&f.e21<f.e50?'DUSUS':'YATAY';}
export function signal(rows,settings=DEFAULTS,disabled=null) {
  const f=features(rows), market=regime(rows);
  const candidates=[1,-1].map(side=>{
    const aligned=side===1?f.e9>f.e21&&f.e21>f.e50:f.e9<f.e21&&f.e21<f.e50;
    const momentum=f.momentum*side>0.002&& (side===1?f.rsi>=50&&f.rsi<=70:f.rsi>=30&&f.rsi<=50);
    const votes={trend:aligned,momentum,breakout:side===1?f.last>f.high:f.last<f.low,pullback:aligned&&Math.abs(f.last/f.e9-1)<0.008&&(side===1?f.rsi<65:f.rsi>35)};
    if(disabled)votes[disabled]=false;
    const count=Object.values(votes).filter(Boolean).length;
    const score=clamp(35+count*14+(f.volumeRatio>=1?6:0)+(aligned?5:0),0,100);
    const reasons=[];
    if(market==='ASIRI_OYNAK')reasons.push('Aşırı oynak piyasa');
    if(!aligned)reasons.push('Yön teyidi yok');
    if(f.volumeRatio<0.9)reasons.push('Hacim teyidi zayıf');
    if(count<settings.minVotes)reasons.push('Strateji mutabakatı yetersiz');
    if(score<settings.minScore)reasons.push('Fırsat puanı yetersiz');
    if(Math.abs(f.last/f.e9-1)>0.02)reasons.push('Fiyatı kovalama koruması');
    return {side,score,votes,count,regime:market,atr:f.atr,reference:f.last,reasons,accepted:reasons.length===0};
  });return candidates.sort((a,b)=>b.score-a.score)[0];
}
export function correlation(a,b) {
  const bm=new Map(b.map(x=>[x.t,x.c]));const pairs=a.filter(x=>bm.has(x.t)).map(x=>[x.c,bm.get(x.t)]);
  if(pairs.length<31)return null;
  const x=[],y=[];for(let i=1;i<pairs.length;i++){x.push(Math.log(pairs[i][0]/pairs[i-1][0]));y.push(Math.log(pairs[i][1]/pairs[i-1][1]));}
  const mx=mean(x),my=mean(y);let xy=0,xx=0,yy=0;for(let i=0;i<x.length;i++){xy+=(x[i]-mx)*(y[i]-my);xx+=(x[i]-mx)**2;yy+=(y[i]-my)**2;}
  return xx&&yy?xy/Math.sqrt(xx*yy):null;
}
export function grossPnl(p,mark) {return p.side*p.qty*(mark-p.entry);}
export function equity(a) {return round(a.balance+a.positions.reduce((s,p)=>s+Math.max(0,p.margin+grossPnl(p,p.mark)-p.qty*p.mark*p.feeRate),0));}
export function liquidationPrice(p) {const r=p.maintenanceRate+p.feeRate;return Math.max(0,p.side===1?(p.entry-p.margin/p.qty)/(1-r):(p.entry+p.margin/p.qty)/(1+r));}
export function updateRiskClock(a,now) {
  const eq=equity(a);if(a.day!==dayKey(now)){a.day=dayKey(now);a.dayStartEquity=eq;}
  a.peak=Math.max(a.peak,eq);
  if(eq<=a.peak*(1-a.settings.maxDrawdownPct/100))a.circuit='Azami sermaye düşüşü sınırı';
  return eq;
}
export function entryBlocks(a,now) {
  const eq=updateRiskClock(a,now),s=a.settings,r=[];
  if(s.paused)r.push('Yeni işlemler duraklatıldı');if(a.circuit)r.push(a.circuit);
  if(eq<=a.dayStartEquity*(1-s.dailyLossPct/100))r.push('Günlük zarar sınırı');
  if(a.positions.length>=s.maxPositions)r.push('Açık pozisyon sınırı');
  const recent=a.trades.slice(-3);if(recent.length===3&&recent.every(x=>x.net<0)&&now-recent.at(-1).closedAt<3600000)r.push('Ardışık zarar beklemesi');
  return r;
}
export function createPendingEntry(sig,meta,now,scale=1) {
  if(!sig?.accepted||![sig.reference,sig.atr].every(x=>Number.isFinite(x)&&x>0))throw Error('Bekleyen giriş için geçerli sinyal gerekli.');
  return {symbol:meta.symbol,meta,side:sig.side,signal:sig,scale,createdAt:now,expiresAt:now+PULLBACK_ENTRY.expiresMs,
    trigger:round(sig.reference-sig.side*sig.atr*PULLBACK_ENTRY.offsetATR),invalidation:round(sig.reference-sig.side*sig.atr*PULLBACK_ENTRY.invalidationATR),
    extreme:sig.reference,touched:false,ready:false,lastCheckedAt:null};
}
export function observePendingEntry(p,mark,now) {
  if(!Number.isFinite(mark)||mark<=0)throw Error('Bekleyen giriş fiyatı geçersiz.');
  if(now>=p.expiresAt)return {action:'IPTAL',reason:'Geri çekilme bekleme süresi doldu'};
  p.lastCheckedAt=now;p.extreme=p.side===1?Math.min(p.extreme,mark):Math.max(p.extreme,mark);
  if(p.side*(mark-p.invalidation)<=0)return {action:'IPTAL',reason:'Geri çekilme güvenli bölgeyi aştı'};
  if(p.side*(mark-p.trigger)<=0)p.touched=true;
  if(!p.touched)return {action:'BEKLE',reason:'Geri çekilme fiyatı bekleniyor'};
  const rebound=p.side*(mark-p.extreme);
  if(rebound<p.signal.atr*PULLBACK_ENTRY.reboundATR)return {action:'BEKLE',reason:'Fiyatın güvenli yönde toparlanması bekleniyor'};
  p.ready=true;return {action:'HAZIR',reason:'Geri çekilme ve toparlanma doğrulandı'};
}
export function pendingConfirmationReasons(p,current,settings,globalRegime=current.regime) {
  const reasons=[];
  if(current.side!==p.side)reasons.push('Sinyal yönü değişti');
  if(current.regime!==(p.side===1?'YUKSELIS':'DUSUS'))reasons.push('Piyasa eğilimi geri çekilmede bozuldu');
  if(globalRegime==='ASIRI_OYNAK'||globalRegime==='YUKSELIS'&&p.side===-1||globalRegime==='DUSUS'&&p.side===1)reasons.push('Bitcoin piyasa koşulu uygun değil');
  if(current.count<Math.max(2,settings.minVotes-1)||current.score<Math.max(70,settings.minScore-20))reasons.push('Geri çekilme sonrası teyit yetersiz');
  if(current.reasons.includes('Hacim teyidi zayıf'))reasons.push('Hacim teyidi zayıf');
  return reasons;
}
export function positionPlan(a,sig,quote,meta,now,correlationScale=1) {
  const s=a.settings,reasons=[...entryBlocks(a,now),...sig.reasons];
  if(!eligible(meta))reasons.push('Coin işlem evrenine uygun değil');
  if(a.positions.some(p=>p.symbol===meta.symbol))reasons.push('Bu coinde açık pozisyon var');
  const last=a.trades.filter(t=>t.symbol===meta.symbol).at(-1);
  if(last&&now-last.closedAt<s.cooldownMinutes*60000)reasons.push('Coin bekleme süresi');
  const mark=Number(quote.mark),bid=Number(quote.bid),ask=Number(quote.ask);
  if(![mark,bid,ask].every(x=>Number.isFinite(x)&&x>0)||bid>ask||Math.abs(now-quote.time)>15000)throw Error('Güncel ve geçerli fiyat gerekli.');
  if((ask-bid)/mark*10000>s.maxSpreadBps)reasons.push('Alış-satış farkı yüksek');
  if(Math.abs(mark/sig.reference-1)>0.015)reasons.push('Sinyal sonrası fiyat uzaklaştı');
  const entry=(sig.side===1?ask:bid)*(1+sig.side*s.slippageBps/10000);
  const stopDist=sig.atr*s.atrMult,stop=entry-sig.side*stopDist, target=entry+sig.side*stopDist*s.rewardRisk;
  if(!(stop>0&&target>0&&stopDist>0))reasons.push('Geçersiz stop mesafesi');
  const eq=equity(a),perUnit=stopDist+entry*(s.feeRate*2+s.slippageBps/10000);
  const openRisk=a.positions.reduce((v,p)=>v+Math.max(0,p.side*(p.entry-p.stop))*p.qty+p.qty*p.entry*p.feeRate*2,0);
  const riskBudget=Math.min(eq*s.riskPct/100,eq*s.maxOpenRiskPct/100-openRisk)*correlationScale;
  const rawQty=Math.min(riskBudget/perUnit,eq*s.maxMarginPct/100*s.leverage/entry,Math.max(0,a.balance)/(entry/s.leverage+entry*s.feeRate));
  const lot=meta.filters.find(f=>f.filterType==='MARKET_LOT_SIZE')||meta.filters.find(f=>f.filterType==='LOT_SIZE');
  const step=Number(lot?.stepSize);if(!(step>0))throw Error('Miktar adımı eksik.');
  const qty=round(Math.floor(Math.max(0,rawQty)/step)*step),notional=qty*entry,margin=notional/s.leverage;
  const minNotional=Number(meta.filters.find(f=>f.filterType==='MIN_NOTIONAL')?.notional||5);
  if(qty<Number(lot.minQty)||qty>Number(lot.maxQty)||notional<minNotional||qty<=0)reasons.push('Risk bütçesi veya miktar sınırı uygun değil');
  const fee=notional*s.feeRate;
  const p={symbol:meta.symbol,side:sig.side,qty,entry,stop,target,initialStop:stop,bestMark:entry,protectionStage:null,protectedAt:null,initialMargin:margin,margin,leverage:s.leverage,entryFee:fee,feeRate:s.feeRate,slippageBps:s.slippageBps,maintenanceRate:s.maintenanceRate,funding:0,lastFunding:now,openedAt:now,mark,markTime:quote.time,votes:sig.votes,regime:sig.regime,score:sig.score};
  const liq=qty?liquidationPrice(p):0;
  if(qty&&sig.side*(stop-liq)<entry*0.003)reasons.push('Stop ile tahmini tasfiye arasında yeterli mesafe yok; kaldıracı azaltın');
  if(stopDist*s.rewardRisk-entry*s.feeRate*2-entry*s.slippageBps*2/10000<perUnit*1.2)reasons.push('Masraf sonrası getiri/risk yetersiz');
  if(reasons.length)return {accepted:false,reasons:[...new Set(reasons)]};
  return {accepted:true,position:p,reasons:[]};
}
export function openPosition(a,plan,id) {
  if(!plan.accepted)throw Error('Reddedilen işlem açılamaz.');
  const p={...plan.position,id};a.balance=round(a.balance-p.margin-p.entryFee);a.positions.push(p);
  a.events.push({id:`open:${id}`,kind:'OPEN',at:p.openedAt,symbol:p.symbol,amount:-p.entryFee});return p;
}
export function applyFunding(a,p,rates,until) {
  for(const r of rates.filter(r=>r.time>p.lastFunding&&r.time>p.openedAt&&r.time<=until).sort((a,b)=>a.time-b.time)) {
    const amount=-p.side*p.qty*r.mark*r.rate;
    p.margin=round(p.margin+amount);p.funding=round(p.funding+amount);p.lastFunding=r.time;
    a.events.push({id:`funding:${p.id}:${r.time}`,kind:'FUNDING',at:r.time,symbol:p.symbol,amount:round(amount)});
  }
}
export function closePosition(a,id,price,reason,now) {
  const p=a.positions.find(x=>x.id===id);if(!p)return a.trades.find(x=>x.id===id)||null;
  if(!Number.isFinite(price)||price<=0)throw Error('Geçersiz kapanış fiyatı.');
  const exit=price*(1-p.side*p.slippageBps/10000),gross=grossPnl(p,exit),exitFee=p.qty*exit*p.feeRate;
  const returned=Math.max(0,p.margin+gross-exitFee),adjustment=returned-(p.margin+gross-exitFee);
  const trade={...p,exit,closedAt:now,reason,gross:round(gross),exitFee:round(exitFee),fees:round(p.entryFee+exitFee),adjustment:round(adjustment),net:round(returned-p.initialMargin-p.entryFee)};
  a.balance=round(a.balance+returned);a.positions=a.positions.filter(x=>x.id!==id);a.trades.push(trade);a.trades=a.trades.slice(-200);
  a.events.push({id:`close:${id}`,kind:'CLOSE',at:now,symbol:p.symbol,amount:trade.net,trade});return trade;
}
export function updateProfitProtection(a,p,observed,now) {
  if(!Number.isFinite(observed)||observed<=0)return false;
  const risk=Math.abs(p.entry-(p.initialStop??p.stop));if(!(risk>0))return false;
  const previousBest=Number.isFinite(p.bestMark)?p.bestMark:p.entry;
  p.bestMark=p.side===1?Math.max(previousBest,observed):Math.min(previousBest,observed);
  const favorable=p.side*(p.bestMark-p.entry),cost=PROFIT_PROTECTION.costTriggerR*risk,trail=PROFIT_PROTECTION.trailTriggerR*risk;
  let candidate=null,stage=null;
  if(favorable>=cost) {
    const simulatedCosts=p.entry*(p.feeRate*2+p.slippageBps*2/10000);
    candidate=p.entry+p.side*(simulatedCosts+PROFIT_PROTECTION.minLockR*risk);stage='MASRAF_KORUMA';
  }
  if(favorable>=trail) {
    const trailing=p.bestMark-p.side*PROFIT_PROTECTION.trailDistanceR*risk;
    candidate=p.side===1?Math.max(candidate,trailing):Math.min(candidate,trailing);stage='KAR_KILITLI';
  }
  if(candidate===null)return false;
  const improved=p.side===1?candidate>p.stop:candidate<p.stop;
  if(!improved)return false;
  const oldStage=p.protectionStage;p.stop=round(candidate);p.protectionStage=stage;p.protectedAt=now;
  if(stage!==oldStage)a.events.push({id:`protection:${p.id}:${stage}`,kind:'PROTECTION',at:now,symbol:p.symbol,stage,stop:p.stop,bestMark:p.bestMark});
  return true;
}
export function manageQuote(a,p,q,now) {
  if(Math.abs(now-q.time)>15000)throw Error('Pozisyon fiyatı güncel değil.');
  p.mark=q.mark;p.markTime=q.time;
  const liquidated=p.margin+grossPnl(p,q.mark)<=p.qty*q.mark*(p.maintenanceRate+p.feeRate);
  const stopHit=p.side*(q.mark-p.stop)<=0,targetHit=p.side*(q.mark-p.target)>=0;
  if(liquidated||stopHit||targetHit)return closePosition(a,p.id,p.side===1?q.bid:q.ask,liquidated?'TASFIYE':stopHit?(p.protectionStage?'KAR_KORUMA':'ZARAR_DURDUR'):'KAR_AL',now);
  updateProfitProtection(a,p,q.mark,now);
  return null;
}
export function snapshot(a,now) {const eq=updateRiskClock(a,now);a.curve.push({t:now,equity:eq});a.curve=a.curve.slice(-500);return eq;}
