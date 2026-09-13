# 0.1.1 giriş bağlantısı düzeltmesi

Supabase kullanıcınız ve tablolarınız kalacak. Yeni SQL çalıştırmanız gerekmez.

1. ZIP'i açın ve içindeki tüm dosya/klasörleri mevcut **kripto-v2** GitHub deposunun köküne yükleyin; aynı adlı dosyaları güncelleyin.
2. Vercel Root Directory depo kökü, Framework Preset Other, Build Command `npm run build`, Output Directory `public` olmalı. `api/` ve `public/` depo kökünde yan yana bulunmalı.
3. Yeni dağıtım Ready olduktan sonra uygulama adresinin sonuna `/api/health` ekleyip açın. `ok: true` ve `version: 0.1.1` içeren JSON görünmeli. 404 gelirse giriş denemeyin; dağıtım adresi ve Build Logs kontrol edilmelidir.
4. Ana sayfada Ctrl+F5 yapın; mevcut kullanıcıyla giriş yapın. Hata sürerse yeni Türkçe mesajı ve uygulama adresini paylaşın; şifrenizi/anahtarları paylaşmayın.

Bu sürüm JSON yerine dönen hata sayfalarını anlaşılır mesajlara çevirir, config doğrulanmadan giriş isteğini engeller ve `.js` API girişlerini açık yollarla ekler. Ekran görüntüsü tek başına hangi HTTP isteğinin başarısız olduğunu kanıtlamaz; canlı adresin doğrulanması gerekir.

Henüz cron kurulmadıysa yeni paketteki zamanlayıcı `/api/v2-cron` kullanır. Önceden `/api/cron` kurulmuşsa eski işleyici uyum için durmaktadır; sırları yeniden oluşturmaya gerek yok.

Geri dönüş: önceki uyumlu Vercel dağıtımına dönülebilir; veritabanına değişiklik yapılmadı.
