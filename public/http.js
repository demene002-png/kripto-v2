export async function readJson(response,label='Bağlantı') {
  const text=await response.text();let value;
  try{value=JSON.parse(text);}catch{
    if(response.status===404)throw Error(`${label} bulunamadı (404). Uygulamanın yeni dağıtımını ve kurulum ayarlarını kontrol edin.`);
    if(response.status===401||response.status===403)throw Error(`${label} erişimi engellendi (${response.status}). Erişim ayarlarını kontrol edin.`);
    throw Error(`${label} beklenen yanıtı vermedi (HTTP ${response.status}). Dağıtım durumunu kontrol edip yeniden deneyin.`);
  }
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} yanıtı geçersiz.`);
  if(!response.ok){
    const code=value.code||value.error_code;
    if(code==='invalid_credentials'||value.error_description==='Invalid login credentials')throw Error('E-posta veya şifre yanlış.');
    if(code==='email_not_confirmed')throw Error('E-posta adresi henüz doğrulanmamış.');
    // Application API emits Turkish error text; Auth errors get a bounded label.
    if(label==='Supabase giriş bağlantısı')throw Error(`Giriş tamamlanamadı (HTTP ${response.status}). Kullanıcı ve e-posta doğrulamasını kontrol edin.`);
    throw Error(typeof value.error==='string'?value.error:`${label} işlemi başarısız (HTTP ${response.status}).`);
  }
  return value;
}
export function publicConfig(value) {
  if(!value||typeof value.url!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(value.url)||typeof value.key!=='string'||!value.key.trim())throw Error('Uygulamanın Supabase bağlantı ayarları eksik veya geçersiz.');
  if(value.key.startsWith('sb_secret_'))throw Error('Sunucu anahtarı giriş ekranında kullanılamaz. Publishable anahtarını kontrol edin.');
  return value;
}
