import test from 'node:test';import assert from 'node:assert/strict';
import {databaseError} from '../server/db-errors.mjs';
test('PGRST003 bağlantı havuzu beklemesi olarak açıklanır',()=>{
  const r=new Response('',{status:504,headers:{'sb-request-id':'a0-123'}});
  const e=databaseError(r,{code:'PGRST003',message:'private',details:'private'},'hesap kilidi alma',2345.1);
  assert.match(e.message,/boş veritabanı bağlantısı/);assert.match(e.message,/hesap kilidi alma/);
  assert.deepEqual(e.diagnostic,{service:'Supabase',operation:'hesap kilidi alma',httpStatus:504,code:'PGRST003',elapsedMs:2345,requestId:'a0-123'});
  assert.doesNotMatch(JSON.stringify(e)+e.message,/private/);
});
test('Gövdesiz 504 Proxy-Status kodunu kullanır',()=>{
  const e=databaseError(new Response('',{status:504,headers:{'proxy-status':'PostgREST; error=PGRST003'}}),null,'kayıt okuma',1);
  assert.equal(e.diagnostic.code,'PGRST003');
});
test('Kodsuz HTML 504 havuz doluluğu olarak tahmin edilmez',()=>{
  const e=databaseError(new Response('HTML',{status:504}),undefined,'hesap kilidi alma',5000);
  assert.equal(e.diagnostic.code,null);assert.match(e.message,/ayrıntılı hata kodu verilmedi/);assert.doesNotMatch(e.message,/boş veritabanı/);
});
test('Sunucu mesajı, detay ve geçersiz kimlikler dışarı çıkarılmaz',()=>{
  const e=databaseError(new Response('',{status:500,headers:{'sb-request-id':'secret with spaces'}}),{code:'sb_secret_hidden',message:'SQL PASSWORD',details:'secret'},'kayıt yazma',10);
  assert.equal(e.diagnostic.requestId,null);assert.equal(e.diagnostic.code,null);assert.doesNotMatch(e.message+JSON.stringify(e),/secret|PASSWORD/);
});
test('KV2 conflict kullanıcıya sabit mesajla gösterilir',()=>{
  const e=databaseError(new Response('',{status:400}),{code:'P0001',message:'KV2_CONFLICT: private details'},'kayıt yazma',5);
  assert.match(e.message,/kilidi veya sürümü değişti/);assert.doesNotMatch(e.message,/private/);
});
