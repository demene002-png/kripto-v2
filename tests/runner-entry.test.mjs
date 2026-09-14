import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,signal} from '../core/engine.mjs';
import {tick} from '../server/runner.mjs';

const meta={symbol:'TESTUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',marginAsset:'USDT',baseAsset:'TEST',filters:[{filterType:'MARKET_LOT_SIZE',stepSize:'0.001',minQty:'0.001',maxQty:'100000'},{filterType:'MIN_NOTIONAL',notional:'5'}]};
function candles(){const now=Date.now(),start=now-68*900000;return Array.from({length:68},(_,i)=>{const o=100+i*.03+Math.sin(i*.7)*.4,c=o+.05;return {t:start+i*900000,end:start+(i+1)*900000-1,o,c,h:c+.3,l:o-.3,v:100+((i%5)*12)};});}
test('Canlı tarama güçlü sinyalde hemen açmaz, düşüş ve toparlanma sonrası açar',async()=>{
  const rows=candles(),sig=signal(rows),a=initialState();a.settings.auto=true;
  assert.equal(sig.accepted,true);
  let quoted=sig.reference;
  const provider={universe:async()=>[meta],candles:async()=>rows,quote:async()=>({mark:quoted,bid:quoted*(1-.0001),ask:quoted*(1+.0001),time:Date.now()}),funding:async()=>[]};
  await tick(a,provider);
  assert.equal(a.positions.length,0);assert.equal(a.pendingEntries.length,1);assert.equal(a.signals.at(-1).action,'GERI_CEKILME');
  const pending=a.pendingEntries[0];quoted=pending.trigger;a.lastRun=0;a.nextScanAt=0;
  await tick(a,provider);
  assert.equal(a.positions.length,0);assert.equal(a.pendingEntries[0].touched,true);
  quoted=pending.trigger+pending.side*pending.signal.atr*.12;a.lastRun=0;a.nextScanAt=0;
  await tick(a,provider);
  assert.equal(a.positions.length,1);assert.equal(a.pendingEntries.length,0);assert.equal(a.signals.at(-1).action,'ACILDI');assert.ok(a.positions[0].entry<sig.reference);
});
