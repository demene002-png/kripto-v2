import test from 'node:test';
import assert from 'node:assert/strict';
import cron from '../api/cron.mjs';
import {initialState} from '../core/engine.mjs';
function setup(t,fetcher){
  const values={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test',CRON_SECRET:'x'.repeat(64)};
  const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
  t.after(()=>{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  t.mock.method(globalThis,'fetch',fetcher);
  return {req:{method:'POST',headers:{authorization:`Bearer ${values.CRON_SECRET}`}},res:{setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}}};
}
const json=x=>new Response(JSON.stringify(x));
test('Bekleme turu eski 451 hatasını güncel hata gibi sunmaz',async t=>{
  const a=initialState();a.lastRun=Date.now();a.nextScanAt=Date.now()+600000;a.lastError='Binance verisi alınamadı (451). İşlem açılmadı.';
  const {req,res}=setup(t,async url=>{
    if(url.includes('/kv2_accounts?'))return json([{user_id:'test'}]);
    if(url.endsWith('/kv2_acquire'))return json({state:a,revision:1});
    if(url.endsWith('/kv2_commit'))return json(2);
    assert.fail('Bekleme sırasında piyasa isteği yapılmamalı');
  });
  await cron(req,res);assert.equal(res.code,200);assert.equal(res.body.reason,'WAITING');assert.equal(res.body.skipped,true);assert.doesNotMatch(res.body.message,/451/);assert.match(res.body.previousError,/451/);
});
test('Meşgul hesap turu kayıt ve piyasa isteği yapmadan atlanır',async t=>{
  let calls=0;const {req,res}=setup(t,async url=>{calls++;if(url.includes('/kv2_accounts?'))return json([{user_id:'test'}]);if(url.endsWith('/kv2_acquire'))return json(null);assert.fail('Meşgul hesaba yazılmamalı');});
  await cron(req,res);assert.equal(res.code,200);assert.equal(res.body.reason,'ACCOUNT_BUSY');assert.equal(res.body.skipped,true);assert.equal(calls,2);
});
test('Kilit zaman aşımı meşgul hesap gibi gizlenmez ve RPC tekrarlanmaz',async t=>{
  let acquires=0;const {req,res}=setup(t,async url=>{if(url.includes('/kv2_accounts?'))return json([{user_id:'test'}]);if(url.endsWith('/kv2_acquire')){acquires++;throw new DOMException('timeout','TimeoutError');}assert.fail('Kilit alınamadığında işlem yapılmamalı');});
  await cron(req,res);assert.equal(res.code,503);assert.match(res.body.error,/hesap kilidi alma: 8 saniyelik/);assert.equal(acquires,1);
});
