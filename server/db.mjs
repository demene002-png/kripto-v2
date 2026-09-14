import {randomUUID} from 'node:crypto';
import {initialState} from '../core/engine.mjs';
import {fetchText} from './transport.mjs';
export function config() {
  const url=process.env.SUPABASE_URL?.trim().replace(/\/+$/,''),key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim(),secret=process.env.SUPABASE_SECRET_KEY?.trim();
  if(!url||!key||!secret||url.includes('YENI-'))throw Error('Önce yeni Supabase projesinin ortam değişkenlerini tanımlayın.');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw Error('Supabase adresi geçersiz.');
  if(!key.startsWith('sb_publishable_')){
    let role;try{role=JSON.parse(Buffer.from(key.split('.')[1]||'', 'base64url').toString()).role;}catch{}
    if(role!=='anon')throw Error('SUPABASE_PUBLISHABLE_KEY alanına yalnız publishable veya anon anahtarını girin.');
  }
  return {url,key,secret};
}
async function request(path,{method='GET',body,key,token}={}) {
  const operation=path.startsWith('/auth/')?'oturum doğrulama':path.includes('/rpc/kv2_acquire')?'hesap kilidi alma':path.includes('/rpc/kv2_commit')?'hesap ve işlem geçmişi kaydetme':path.includes('/rpc/kv2_release')?'hesap kilidi bırakma':method==='GET'?'kayıt okuma':'kayıt yazma';
  const c=config();const {response:r,text}=await fetchText(c.url+path,{method,headers:{apikey:key||c.secret,...(token?{Authorization:`Bearer ${token}`} : c.secret.startsWith('eyJ')?{Authorization:`Bearer ${c.secret}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})},{label:`Supabase — ${operation}`,timeoutMs:path==='/rest/v1/rpc/kv2_acquire'?8000:5000,retryRead:true});
  let data;try{data=text?JSON.parse(text):null;}catch{throw Error(`Supabase — ${operation}: yanıt okunamadı.`);}
  if(!r.ok){if(data?.message?.includes('KV2_'))throw Error(data.message);throw Error(`Supabase işlemi başarısız (${r.status}).`);}return data;
}
export const rpc=(name,body)=>request(`/rest/v1/rpc/${name}`,{method:'POST',body});
export const select=(table,query)=>request(`/rest/v1/${table}?${query}`);
export async function userId(req) {
  const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token||token.length>10000)throw Error('Oturum açmanız gerekli.');
  const c=config(),u=await request('/auth/v1/user',{key:c.key,token});if(!u?.id)throw Error('Oturum doğrulanamadı.');return u.id;
}
export async function account(uid) {const rows=await select('kv2_accounts',`user_id=eq.${uid}&select=state,revision`);return rows[0]||null;}
export async function withAccount(uid,work) {
  const token=randomUUID();const lock=await rpc('kv2_acquire',{p_user:uid,p_token:token,p_initial:initialState()});
  if(!lock){const e=Error('Hesap üzerinde işlem sürüyor. Birkaç saniye sonra tekrar deneyin.');e.code='KV2_BUSY';throw e;}
  const state=lock.state;state.events=[];
  try {
    const output=await work(state,lock.revision);
    const events=state.events;state.events=[];
    const revision=await rpc('kv2_commit',{p_user:uid,p_token:token,p_revision:lock.revision,p_state:state,p_events:events});
    return {state,revision,output};
  } catch(error) {
    // No financial mutation is retried blindly. Expiring lease is the crash fallback.
    await rpc('kv2_release',{p_user:uid,p_token:token}).catch(()=>{});throw error;
  }
}
