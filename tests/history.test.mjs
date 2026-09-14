import test from 'node:test';
import assert from 'node:assert/strict';
import {historyQuery,historyPage} from '../server/history.mjs';
import {TradeHistory} from '../public/history.js';
import handler from '../api/app.mjs';
const time='2026-09-14T06:24:01.139123+00:00';
const event=n=>({event_id:`close:${String(n).padStart(4,'0')}`,created_at:time,payload:{trade:{id:String(n),closedAt:n,net:n}}});
test('Supabase UTC ofseti ve mikrosaniyeler geçmiş imlecinde korunur',()=>{
  const page=historyPage(Array.from({length:51},(_,i)=>event(100-i)));
  assert.equal(page.rows.length,50);assert.equal(page.hasMore,true);
  const q=new URLSearchParams(historyQuery('owner',page.nextCursor));
  assert.equal(q.get('user_id'),'eq.owner');assert.equal(q.get('kind'),'eq.CLOSE');
  assert.equal(q.get('order'),'created_at.desc,event_id.desc');
  assert.equal(q.get('or'),`(created_at.lt.${time},and(created_at.eq.${time},event_id.lt.close:0051))`);
  assert.equal(new URLSearchParams(historyQuery('owner',time)).get('created_at'),`lt.${time}`);
});
test('Aynı zamanlı kapanışlar sayfa sınırında atlanmaz',()=>{
  const source=Array.from({length:101},(_,i)=>event(101-i));
  let remaining=source,ids=[];
  while(remaining.length){
    const page=historyPage(remaining.slice(0,51));ids.push(...page.rows.map(x=>x.event_id));
    if(!page.hasMore)break;
    const cursor=JSON.parse(Buffer.from(page.nextCursor,'base64url').toString());
    remaining=remaining.filter(x=>x.event_id<cursor.id);
  }
  assert.deepEqual(ids,source.map(x=>x.event_id));assert.equal(new Set(ids).size,101);
});
test('Boş, tek kayıtlı ve tam 50 kayıtlı son sayfalar doğru biter',()=>{
  for(const n of [0,1,50]){const page=historyPage(Array.from({length:n},(_,i)=>event(i)));assert.equal(page.hasMore,false);assert.equal(page.nextCursor,null);}
});
test('Filtre eklemeye çalışan veya bozuk imleçler reddedilir',()=>{
  for(const c of ['abc',time+',user_id.neq.owner',[], 'a'.repeat(1025),Buffer.from(JSON.stringify({time,id:'x),user_id.neq.owner'})).toString('base64url')])assert.throws(()=>historyQuery('owner',c),/Geçersiz/);
});
test('İlk yükleme, sonraki sayfa, panel yenilemesi kayıtları çoğaltmaz veya silmez',async()=>{
  const h=new TradeHistory();h.merge([event(100).payload.trade]);
  const first=historyPage(Array.from({length:51},(_,i)=>event(100-i)));
  await h.load(async path=>{assert.equal(path,'/api/v2-app?history=1');return first;});
  assert.equal(h.rows.length,50);
  h.merge([event(101).payload.trade,event(100).payload.trade]);
  await h.load(async path=>{assert.equal(new URL(path,'https://test').searchParams.get('before'),first.nextCursor);return historyPage([event(50)]);});
  assert.equal(h.rows.length,52);assert.equal(h.rows[0].id,'101');assert.equal(h.hasMore,false);
  h.merge([event(101).payload.trade]);assert.equal(h.rows.length,52);
  await h.load(()=>{throw Error('Bitmiş geçmiş yeniden çağrılmamalı');});assert.equal(h.error,'');
});
test('Çift tıklama tek istek gönderir, hata imleci korur ve tekrar denenir',async()=>{
  const h=new TradeHistory();let finish,calls=0;
  const pending=h.load(()=>{calls++;return new Promise(resolve=>finish=resolve);});
  await h.load(()=>{calls++;});assert.equal(calls,1);
  finish(historyPage(Array.from({length:51},(_,i)=>event(100-i))));await pending;
  const cursor=h.cursor;
  await h.load(async()=>{throw Error('Bağlantı zaman aşımı');});
  assert.equal(h.cursor,cursor);assert.equal(h.rows.length,50);assert.equal(h.error,'Bağlantı zaman aşımı');assert.equal(h.loading,false);
  await h.load(async()=>historyPage([event(50)]));assert.equal(h.rows.length,51);assert.equal(h.error,'');
});
test('Tek gerçek kapanış başarılı yükleme olarak belirtilir',async()=>{
  const h=new TradeHistory();h.merge([event(1).payload.trade]);
  await h.load(async()=>historyPage([event(1)]));
  assert.equal(h.rows.length,1);assert.equal(h.loaded,true);assert.equal(h.hasMore,false);
});
test('Geçmiş API kullanıcıyı doğrular, yalnız kendi kapanışlarını okur, hesap kilidi almaz',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_HTTP_TRANSPORT'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),fetcher=globalThis.fetch,paths=[];
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_HTTP_TRANSPORT:'fetch'});
  globalThis.fetch=async(url)=>{const u=new URL(url);paths.push(u.pathname);if(u.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:'owner'}));assert.equal(u.pathname,'/rest/v1/kv2_events');assert.equal(u.searchParams.get('user_id'),'eq.owner');assert.equal(u.searchParams.get('kind'),'eq.CLOSE');return new Response(JSON.stringify([event(1)]));};
  const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}};
  try{await handler({method:'GET',query:{history:'1'},headers:{authorization:'Bearer test'}},res);assert.equal(res.code,200);assert.equal(res.body.rows.length,1);assert.equal(res.body.hasMore,false);assert.deepEqual(paths,['/auth/v1/user','/rest/v1/kv2_events']);}
  finally{globalThis.fetch=fetcher;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
