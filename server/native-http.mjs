import https from 'node:https';

// A fresh HTTPS connection per request isolates connection reuse as a variable.
// No redirects, no request replay, no disabled certificate verification.
export function nativeFetch(url,{method='GET',headers={},body,signal}={}){
  const target=new URL(url);
  if(target.protocol!=='https:'||target.username||target.password)throw new Error('Geçersiz HTTPS adresi.');
  if(body!==undefined&&typeof body!=='string')throw new Error('İstek gövdesi metin olmalı.');
  const payload=body===undefined?undefined:Buffer.from(body,'utf8');
  const outgoing=new Headers(headers);
  outgoing.set('connection','close');outgoing.set('accept-encoding','identity');
  outgoing.delete('transfer-encoding');outgoing.delete('content-length');
  if(payload!==undefined)outgoing.set('content-length',String(payload.length));
  return new Promise((resolve,reject)=>{
    const failed=error=>reject(signal?.aborted?signal.reason:new TypeError('HTTPS bağlantısı tamamlanamadı.'));
    const req=https.request(target,{method,headers:Object.fromEntries(outgoing),agent:false,rejectUnauthorized:true,signal},res=>{
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>16*1024*1024){res.destroy();req.destroy();reject(new Error('HTTPS yanıtı boyut sınırını aştı.'));return;}
        chunks.push(chunk);
      });
      res.once('error',failed);res.once('aborted',failed);
      res.once('end',()=>{
        if(!res.complete){failed();return;}
        const responseHeaders=new Headers();
        for(const [key,value] of Object.entries(res.headers))if(value!==undefined)responseHeaders.set(key,Array.isArray(value)?value.join(', '):value);
        const text=Buffer.concat(chunks).toString('utf8'),status=res.statusCode||0;
        resolve({status,ok:status>=200&&status<300,headers:responseHeaders,text:async()=>text});
      });
    });
    req.once('error',failed);
    req.end(payload);
  });
}

export function supabaseTransport(){
  const mode=process.env.SUPABASE_HTTP_TRANSPORT?.trim()||'native';
  if(!['native','fetch'].includes(mode))throw new Error('SUPABASE_HTTP_TRANSPORT yalnız native veya fetch olabilir.');
  return mode;
}
