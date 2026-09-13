import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchText} from '../server/transport.mjs';
import {publicGet} from '../server/market.mjs';
import {select,rpc} from '../server/db.mjs';
const timeout=()=>new DOMException('The operation was aborted due to timeout','TimeoutError');
test('Geçici okuma zaman aşımı yalnız bir kez tekrar edilir',async()=>{
  let calls=0;const r=await fetchText('https://example.com',{method:'GET'},{label:'Supabase — kayıt okuma',timeoutMs:5000,retryRead:true,fetcher:async()=>{if(++calls===1)throw timeout();return new Response('[]');}});
  assert.equal(calls,2);assert.equal(r.text,'[]');
});
test('Kalıcı okuma hatasında işlem adı gösterilir, iki istekte durur',async()=>{
  let calls=0;await assert.rejects(fetchText('https://example.com',{method:'GET'},{label:'Supabase — kayıt okuma',timeoutMs:5000,retryRead:true,fetcher:async()=>{calls++;throw timeout();}}),/Supabase — kayıt okuma: 5 saniyelik/);assert.equal(calls,2);
});
test('Yanıtı kaybolan yazma işlemi tekrar gönderilmez',async()=>{
  let writes=0;await assert.rejects(fetchText('https://example.com',{method:'POST'},{label:'Supabase — hesap ve işlem geçmişi kaydetme',timeoutMs:5000,retryRead:true,fetcher:async()=>{writes++;return {text:async()=>{throw timeout();}};}}),/hesap ve işlem geçmişi kaydetme/);assert.equal(writes,1);
});
test('HTTP yetkilendirme hatası tekrar edilmez',async()=>{
  let calls=0;const r=await fetchText('https://example.com',{method:'GET'},{label:'Supabase',timeoutMs:5000,retryRead:true,fetcher:async()=>{calls++;return new Response('{}',{status:401});}});assert.equal(calls,1);assert.equal(r.response.status,401);
});
test('Bağlantı hatası gizli URL veya anahtar içermez',async()=>{
  await assert.rejects(fetchText('https://example.com/secret',{method:'POST'},{label:'Supabase',timeoutMs:5000,fetcher:async()=>{throw new TypeError('secret-value');}}),e=>e.message.includes('bağlantı')&&!e.message.includes('secret'));
});
test('Binance zaman aşımı kaynak adıyla gösterilir ve tekrar edilmez',async()=>{
  let calls=0;await assert.rejects(publicGet('/fapi/v1/klines',{},async()=>{calls++;throw timeout();}),/Binance — klines: 4 saniyelik/);assert.equal(calls,1);
});
test('Binance 451 erişim reddi korunur',async()=>{
  await assert.rejects(publicGet('/fapi/v1/klines',{},async()=>new Response('restricted',{status:451})),/Binance verisi alınamadı \(451\)/);
});
test('Supabase bağlantısı okuma tekrarını ve yazma aşaması mesajını uygular',async t=>{
  const values={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'};
  const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
  t.after(()=>{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  let reads=0,writes=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(options.method==='GET'){if(++reads===1)throw timeout();return new Response('[]');}
    writes++;throw timeout();
  });
  assert.deepEqual(await select('kv2_accounts','select=user_id'),[]);assert.equal(reads,2);
  await assert.rejects(rpc('kv2_commit',{}),/Supabase — hesap ve işlem geçmişi kaydetme: 5 saniyelik/);assert.equal(writes,1);
});
