import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,DEFAULTS,eligible,validateSettings,features,positionPlan,openPosition,createPendingEntry,observePendingEntry,pendingConfirmationReasons,closePosition,applyFunding,equity,liquidationPrice,manageQuote,entryBlocks,correlation,dayKey} from '../core/engine.mjs';
import {publicGet,parseCandles} from '../server/market.mjs';
const now=Date.UTC(2026,8,13,12);
const meta={symbol:'BTCUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',marginAsset:'USDT',baseAsset:'BTC',filters:[{filterType:'MARKET_LOT_SIZE',stepSize:'0.001',minQty:'0.001',maxQty:'100000'},{filterType:'MIN_NOTIONAL',notional:'5'}]};
function sig(side=1,atr=1){return {side,score:95,count:4,votes:{trend:true,momentum:true,breakout:true,pullback:true},reasons:[],atr,reference:100,regime:side===1?'YUKSELIS':'DUSUS'};}
function setup(side=1){const a=initialState(now);const plan=positionPlan(a,sig(side),{mark:100,bid:100,ask:100,time:now},meta,now);assert.equal(plan.accepted,true,JSON.stringify(plan));const p=openPosition(a,plan,'one');return {a,p};}
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-6,`${x} != ${y}`);
test('Başlangıç tam 1000 USDT, hedef alanı yok',()=>{const a=initialState(now);assert.equal(a.balance,1000);assert.equal('dailyProfitTarget' in a.settings,false);});
test('1–50x kabul edilir, 51x ve yabancı ayar reddedilir',()=>{assert.equal(validateSettings(DEFAULTS,{leverage:50}).leverage,50);assert.throws(()=>validateSettings(DEFAULTS,{leverage:51}));assert.throws(()=>validateSettings(DEFAULTS,{leverage:NaN}));assert.throws(()=>validateSettings(DEFAULTS,{dailyProfitTarget:3}));});
test('Stablecoin USDT taban olarak engellenir; BTC ve BNB kalır',()=>{for(const baseAsset of ['USDT','USDC','U','USD1','USDE'])assert.equal(eligible({...meta,baseAsset}),false);for(const baseAsset of ['BTC','BNB'])assert.equal(eligible({...meta,baseAsset}),true);});
test('LONG komisyon ve teminat muhasebesi; iki kez kapanış değişiklik yapmaz',()=>{const {a,p}=setup();near(a.balance,1000-p.initialMargin-p.entryFee);const t=closePosition(a,p.id,110,'MANUEL',now+60000);near(t.net,p.qty*(110*(1-p.slippageBps/10000)-p.entry)-t.fees);near(a.balance,1000+t.net);const cash=a.balance;closePosition(a,p.id,120,'MANUEL',now+120000);assert.equal(a.balance,cash);assert.equal(a.trades.length,1);});
test('SHORT düşüşte kâr eder, kaldıraç K/Z üzerine ikinci kez çarpılmaz',()=>{const {a,p}=setup(-1);const t=closePosition(a,p.id,90,'MANUEL',now+60000);assert.ok(t.net>0);near(t.gross,p.qty*(p.entry-t.exit));near(a.balance,1000+t.net);});
test('Fonlama aynı zaman damgasında yalnız bir kez; pozitif oran long öder short alır',()=>{for(const side of [1,-1]){const {a,p}=setup(side);const rates=[{time:now+1000,mark:100,rate:.001}];applyFunding(a,p,rates,now+1000);const margin=p.margin;applyFunding(a,p,rates,now+1000);assert.equal(margin,p.margin);near(p.funding,-side*p.qty*.1);const t=closePosition(a,p.id,100,'MANUEL',now+2000);near(t.net,t.gross-t.fees+t.funding);near(a.balance,1000+t.net);}});
test('Yeni işlem durdurma açık olsa bile manuel kapanış çalışır',()=>{const {a,p}=setup();a.settings.paused=true;assert.ok(entryBlocks(a,now).length);assert.ok(closePosition(a,p.id,100,'MANUEL',now+1));});
test('50x ve uzak stop tasfiye tamponundan reddedilir',()=>{const a=initialState(now);a.settings.leverage=50;const r=positionPlan(a,sig(1,2),{mark:100,bid:100,ask:100,time:now},meta,now);assert.equal(r.accepted,false);assert.ok(r.reasons.some(x=>x.includes('tasfiye')));});
test('Veri güncel değilse işlem planı üretilemez',()=>{assert.throws(()=>positionPlan(initialState(now),sig(),{mark:100,bid:100,ask:100,time:now-20000},meta,now));});
test('İzole tasfiye hesap bakiyesini negatife düşürmez',()=>{const {a,p}=setup();const free=a.balance;const liq=liquidationPrice(p);assert.ok(liq<p.stop);const t=manageQuote(a,p,{mark:1,bid:1,ask:1,time:now},now);assert.equal(t.reason,'TASFIYE');assert.equal(a.positions.length,0);near(a.balance,free);near(t.net,-p.initialMargin-p.entryFee);});
test('Günlük kâr eşiği yok, yüksek kâr işlem açmayı engellemez',()=>{const a=initialState(now);a.balance=1500;a.peak=1500;assert.deepEqual(entryBlocks(a,now),[]);});
test('Günlük zarar ve zirveye göre düşüş ayrı korunur',()=>{const a=initialState(now);a.balance=965;assert.ok(entryBlocks(a,now).includes('Günlük zarar sınırı'));a.balance=910;assert.ok(entryBlocks(a,now).some(x=>x.includes('sermaye')));});
test('Türkiye gece yarısı günlük dönem değişir',()=>{assert.equal(dayKey(Date.UTC(2026,8,13,20,59)),'2026-09-13');assert.equal(dayKey(Date.UTC(2026,8,13,21)),'2026-09-14');});
test('RSI sıfır kayıpta 100, yatay seride 50',()=>{const rows=Array.from({length:70},(_,i)=>({t:i,c:100+i,h:101+i,l:99+i,v:100}));assert.equal(features(rows).rsi,100);assert.equal(features(rows.map(x=>({...x,c:100,h:101,l:99}))).rsi,50);});
test('Korelasyon zaman damgasına göre eşlenir; eksik örnek veri uydurmaz',()=>{const r=Array.from({length:65},(_,i)=>({t:i,c:100+Math.sin(i)*3+i*.1}));near(correlation(r,r),1);assert.equal(correlation(r,r.slice(0,5)),null);});
test('Açık mum dışlanır, hata JSONu reddedilir',()=>{assert.throws(()=>parseCandles({code:-1}));const r=parseCandles([[0,'1','2','1','2','3',10],[11,'1','2','1','2','3',30]],20);assert.equal(r.length,1);});
test('Binance emir yolları ağ çağrısı yapılmadan reddedilir',async()=>{let called=false;await assert.rejects(publicGet('/fapi/v1/order',{},async()=>{called=true;}));assert.equal(called,false);});
test('HTTP hata JSONu geçerli piyasa gibi kullanılmaz',async()=>{await assert.rejects(publicGet('/fapi/v1/klines',{},async()=>({ok:false,status:451})));});
test('İşlemden hemen sonra özsermaye giriş+çıkış maliyetlerini içerir',()=>{const {a,p}=setup();near(equity(a),1000-p.entryFee+p.side*p.qty*(p.mark-p.entry)-p.qty*p.mark*p.feeRate);});
test('Aynı coin ikinci pozisyon ve cooldown denetlenir',()=>{const {a,p}=setup();assert.equal(positionPlan(a,sig(),{mark:100,bid:100,ask:100,time:now},meta,now).accepted,false);closePosition(a,p.id,100,'MANUEL',now+10);assert.ok(positionPlan(a,sig(),{mark:100,bid:100,ask:100,time:now+20},meta,now+20).reasons.some(x=>x.includes('bekleme')));});
test('0,75 risk ilerlemede masraflardan sonra anlamlı kâr kilitlenir ve stop geri gitmez',()=>{
  for(const side of [1,-1]){
    const {a,p}=setup(side),risk=Math.abs(p.entry-p.initialStop),first=p.stop;
    assert.equal(manageQuote(a,p,{mark:p.entry+side*risk*.74,bid:p.entry+side*risk*.74,ask:p.entry+side*risk*.74,time:now},now),null);assert.equal(p.stop,first);
    const favorable=p.entry+side*risk*.75;
    assert.equal(manageQuote(a,p,{mark:favorable,bid:favorable,ask:favorable,time:now},now),null);assert.equal(p.protectionStage,'MASRAF_KORUMA');assert.ok(side*(p.stop-p.entry)>0);
    const protectedStop=p.stop;
    manageQuote(a,p,{mark:p.entry+side*risk*.9,bid:p.entry+side*risk*.9,ask:p.entry+side*risk*.9,time:now},now);
    assert.ok(side*(p.stop-protectedStop)>=0);
    const t=manageQuote(a,p,{mark:p.stop,bid:p.stop,ask:p.stop,time:now},now);assert.equal(t.reason,'KAR_KORUMA');assert.ok(t.net>=p.qty*risk*.2);
  }
});
test('Bir risk ilerlemeden sonra stop en iyi fiyatı yarım risk geriden izler',()=>{
  for(const side of [1,-1]){
    const {a,p}=setup(side),risk=Math.abs(p.entry-p.initialStop),best=p.entry+side*risk*1.4;
    manageQuote(a,p,{mark:best,bid:best,ask:best,time:now},now);
    assert.equal(p.protectionStage,'KAR_KILITLI');near(p.stop,best-side*risk*.5);
    const old=p.stop,worse=p.entry+side*risk*1.1;
    manageQuote(a,p,{mark:worse,bid:worse,ask:worse,time:now},now);assert.equal(p.stop,old);
  }
});
test('Kâr koruma aşama olayları bir kez yazılır',()=>{
  const {a,p}=setup(),risk=p.entry-p.initialStop;
  for(const r of [.75,.9,1,1.2]){const mark=p.entry+r*risk;manageQuote(a,p,{mark,bid:mark,ask:mark,time:now+r*1000},now+r*1000);}
  assert.deepEqual(a.events.filter(e=>e.kind==='PROTECTION').map(e=>e.stage),['MASRAF_KORUMA','KAR_KILITLI']);
});
test('Güncellemeden önce açılmış pozisyon kâr korumaya güvenle alınır',()=>{
  const {a,p}=setup(),risk=p.entry-p.initialStop;delete p.bestMark;delete p.protectionStage;delete p.protectedAt;
  const mark=p.entry+risk*.8;manageQuote(a,p,{mark,bid:mark,ask:mark,time:now},now);
  assert.equal(p.protectionStage,'MASRAF_KORUMA');assert.equal(p.bestMark,mark);assert.ok(p.stop>p.entry);
});
test('Güçlü sinyal hemen açılmaz; geri çekilme ve toparlanmayı bekler',()=>{
  const pending=createPendingEntry({...sig(),accepted:true},meta,now),atr=pending.signal.atr;
  assert.equal(observePendingEntry(pending,pending.signal.reference,now).action,'BEKLE');
  assert.equal(observePendingEntry(pending,pending.trigger,now+1000).action,'BEKLE');assert.equal(pending.touched,true);
  const ready=observePendingEntry(pending,pending.extreme+atr*.12,now+2000);assert.equal(ready.action,'HAZIR');assert.equal(pending.ready,true);
});
test('Derin düşüş ve süresi dolan giriş fırsatı iptal edilir',()=>{
  const deep=createPendingEntry({...sig(),accepted:true},meta,now);assert.equal(observePendingEntry(deep,deep.invalidation,now+1).action,'IPTAL');
  const expired=createPendingEntry({...sig(),accepted:true},meta,now);assert.equal(observePendingEntry(expired,100,expired.expiresAt).reason,'Geri çekilme bekleme süresi doldu');
});
test('Geri çekilme sonrası yön veya piyasa eğilimi bozulursa teyit verilmez',()=>{
  const pending=createPendingEntry({...sig(),accepted:true},meta,now),current={...sig(),reasons:[]};
  assert.deepEqual(pendingConfirmationReasons(pending,current,DEFAULTS),[]);
  assert.ok(pendingConfirmationReasons(pending,{...current,side:-1},DEFAULTS).includes('Sinyal yönü değişti'));
  assert.ok(pendingConfirmationReasons(pending,{...current,regime:'YATAY'},DEFAULTS).some(x=>x.includes('eğilimi')));
});
