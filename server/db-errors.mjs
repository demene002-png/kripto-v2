// Only fixed descriptions and validated identifiers may reach logs or clients.
const meanings={
  PGRST003:'API, boş veritabanı bağlantısı beklerken süre sınırına ulaştı.',
  PGRST000:'API veritabanına bağlanamadı.',
  PGRST001:'API veritabanına bağlanırken hata oluştu.',
  PGRST002:'API şema bilgilerini yüklerken veritabanına bağlanamadı.',
  '57014':'Veritabanı sorgusu iptal edildi; sorgu süresi sınırı olası nedenlerden biridir.',
  '55P03':'Veritabanı kilidi alınamadı.',
  '53300':'Veritabanı bağlantı sınırına ulaşıldı.'
};
function safeCode(value){return typeof value==='string'&&/^(?:PGRST[A-Z0-9]{3}|[0-9A-Z]{5})$/.test(value)?value:null;}
export function databaseError(response,data,operation,elapsedMs){
  const proxy=response.headers?.get('proxy-status')||'';
  const proxyCode=proxy.match(/\berror\s*=\s*"?([A-Z0-9]+)"?(?:\s*;|\s*,|\s*$)/i)?.[1];
  const code=safeCode(data?.code)||safeCode(proxyCode);
  const rawId=response.headers?.get('sb-request-id');
  const requestId=rawId&&/^[a-zA-Z0-9_-]{1,100}$/.test(rawId)?rawId:null;
  const details={service:'Supabase',operation,httpStatus:response.status,code,elapsedMs:Math.max(0,Math.round(elapsedMs)),requestId};
  let meaning=meanings[code]||(response.status===504?'API geçidinden zaman aşımı yanıtı geldi; ayrıntılı hata kodu verilmedi.':'İstek başarısız oldu.');
  if(typeof data?.message==='string'&&data.message.startsWith('KV2_CONFLICT:'))meaning='Hesap kilidi veya sürümü değişti; güncel kayıt yeniden okunmalı.';
  if(typeof data?.message==='string'&&data.message.startsWith('KV2_INVALID:'))meaning='Hesap değerleri veritabanı kontrolünden geçmedi.';
  const error=new Error(`Supabase — ${operation}: HTTP ${response.status}${code?` / ${code}`:''}. ${meaning}`);
  error.diagnostic=details;return error;
}
