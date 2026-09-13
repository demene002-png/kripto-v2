import test from 'node:test';import assert from 'node:assert/strict';
import app from '../api/app.mjs';import cron from '../api/cron.mjs';import research from '../api/research.mjs';
function response(){return {code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(j){this.body=j;return this;}};}
test('Kimliksiz hesap erişimi ve işlem değişikliği engellenir',async()=>{for(const method of ['GET','POST']){const r=response();await app({method,headers:{},body:{action:'scan'},query:{}},r);assert.equal(r.code,400);assert.match(r.body.error,/Oturum/);}});
test('Cron gizli değersiz tetiklenemez',async()=>{const r=response();await cron({method:'POST',headers:{}},r);assert.equal(r.code,401);});
test('Cron GET istekleri reddedilir',async()=>{const r=response();await cron({method:'GET',headers:{}},r);assert.equal(r.code,405);});
test('Araştırma oturumsuz başlatılamaz',async()=>{const r=response();await research({method:'POST',headers:{},body:{}},r);assert.equal(r.code,400);assert.match(r.body.error,/Oturum/);});
test('Supabase ayarı olmadan sahte hesap başarı sonucu verilmez',async()=>{const prev={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,secret:process.env.SUPABASE_SECRET_KEY};delete process.env.SUPABASE_URL;try{const r=response();await app({method:'GET',headers:{},query:{config:'1'}},r);assert.equal(r.code,400);assert.ok(!('state' in r.body));}finally{if(prev.url)process.env.SUPABASE_URL=prev.url;}});
