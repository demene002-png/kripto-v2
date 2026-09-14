import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {once} from 'node:events';
import {nativeFetch,supabaseTransport} from '../server/native-http.mjs';
import {fetchText} from '../server/transport.mjs';
import {rpc} from '../server/db.mjs';

async function local(t,handler){
  const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  t.mock.method(https,'request',(url,options,callback)=>{
    // Only the test socket is plain HTTP. Production must always verify TLS.
    assert.equal(url.protocol,'https:');assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent,false);
    return http.request(`http://127.0.0.1:${server.address().port}${url.pathname}${url.search}`,options,callback);
  });
}
function env(t,values){const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);t.after(()=>{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});}
test('Türkçe JSON gövdesi eksiksiz, doğru bayt uzunluğu ve ayrı bağlantılarla gider',async t=>{
  const received=[],sockets=new Set();
  await local(t,(req,res)=>{sockets.add(req.socket);const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
    const buffer=Buffer.concat(chunks);received.push({body:buffer.toString('utf8'),length:buffer.length,headers:req.headers});
    res.setHeader('Content-Type','application/json');res.end('{"sonuc":"Başarılı"}');
  });});
  const body=JSON.stringify({durum:'Yükseliş — İşlem açılmadı',not:'Türkçe ğüşıöç'});
  for(let i=0;i<2;i++){
    const r=await nativeFetch('https://example.supabase.co/rest/v1/rpc/kv2_acquire',{method:'POST',body,headers:{'Content-Type':'application/json','Content-Length':'1'}});
    assert.equal(r.status,200);assert.equal(await r.text(),'{"sonuc":"Başarılı"}');
  }
  assert.equal(sockets.size,2);
  for(const r of received){assert.equal(r.body,body);assert.equal(Number(r.headers['content-length']),Buffer.byteLength(body));assert.equal(r.headers['transfer-encoding'],undefined);assert.equal(r.headers.connection,'close');}
});
test('Sunucuda alınan ama yanıtı tamamlanmayan POST iptal edilir ve tekrarlanmaz',async t=>{
  let writes=0;
  await local(t,(req,res)=>{req.resume();req.on('end',()=>{writes++;res.writeHead(200,{'Content-Type':'application/json'});res.write('{');});});
  await assert.rejects(fetchText('https://example.supabase.co/rest/v1/rpc/kv2_commit',{method:'POST',body:'{}'},{label:'Supabase — kayıt yazma',timeoutMs:100,retryRead:true,fetcher:nativeFetch}),/süre sınırı/);
  assert.equal(writes,1);
});
test('Native bağlantı 504 ayrıntılarını DB ve cron teşhisi için korur',async t=>{
  env(t,{SUPABASE_HTTP_TRANSPORT:'native',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'});
  let writes=0;await local(t,(req,res)=>{req.resume();req.on('end',()=>{writes++;res.writeHead(504,{'sb-request-id':'test-request-1','Content-Type':'application/json'});res.end(JSON.stringify({code:'PGRST003',message:'internal secret'}));});});
  await assert.rejects(rpc('kv2_acquire',{p_initial:{status:'İşlem'}}),e=>{
    assert.equal(e.diagnostic.transport,'native');assert.equal(e.diagnostic.httpStatus,504);assert.equal(e.diagnostic.code,'PGRST003');assert.equal(e.diagnostic.requestId,'test-request-1');assert.doesNotMatch(e.message,/internal secret/);return true;
  });assert.equal(writes,1);
});
test('Yönlendirme izlenmez ve anahtar başka adrese gönderilmez',async t=>{
  let calls=0;await local(t,(req,res)=>{calls++;res.writeHead(307,{Location:'https://other.example/private'});res.end();});
  const r=await nativeFetch('https://example.supabase.co/rest/v1/table',{headers:{apikey:'test'}});
  assert.equal(r.status,307);assert.equal(r.ok,false);assert.equal(calls,1);
});
test('Kesilen yanıt başarılı kayıt gibi yorumlanmaz',async t=>{
  await local(t,(req,res)=>{res.writeHead(200,{'Content-Length':'100'});res.write('{}');res.socket.destroy();});
  await assert.rejects(nativeFetch('https://example.supabase.co/rest/v1/table'),/bağlantısı tamamlanamadı/);
});
test('HTTP ve URL içine gömülmüş kimlik bilgileri reddedilir',()=>{
  assert.throws(()=>nativeFetch('http://example.supabase.co'),/Geçersiz HTTPS/);
  assert.throws(()=>nativeFetch('https://user:pass@example.supabase.co'),/Geçersiz HTTPS/);
});
test('Bağlantı seçimi açık ve geri alınabilir; yazım hatası sessizce kabul edilmez',t=>{
  env(t,{SUPABASE_HTTP_TRANSPORT:''});assert.equal(supabaseTransport(),'native');
  process.env.SUPABASE_HTTP_TRANSPORT='fetch';assert.equal(supabaseTransport(),'fetch');
  process.env.SUPABASE_HTTP_TRANSPORT='invalid';assert.throws(supabaseTransport,/yalnız native veya fetch/);
});
