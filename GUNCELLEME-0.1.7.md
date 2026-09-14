# 0.1.7 — Supabase bağlantı yöntemini karşılaştırma

## Kanıt ve sınırı

Kullanıcının pg_stat_statements sonucu: kv2_acquire için 597 kayıtlı çalıştırma, ortalama 2,86 ms, en yavaş 79,60 ms. Kaydedilen SQL çalışmaları hızlıdır. Bu ölçüm, API'de bağlantı bekleyen veya veritabanında tamamlanmayan bütün istekleri kapsamaz. SQL'in kesinlikle sorun dışı olduğu veya bağlantı havuzunun dolduğu söylenemez.

## Değişiklik

Supabase sunucu çağrıları varsayılan olarak Node HTTPS istemcisini kullanır. Her istek yeni bağlantıyla gönderilir; önceki bağlantı yeniden kullanılmaz. JSON gövdesi UTF-8 baytlarına dönüştürülür, Content-Length bu baytlardan hesaplanır. Sertifika doğrulaması açıktır; yönlendirme takip edilmez. Böylece HTTP istemcisi ve bağlantı yeniden kullanımının etkisi mevcut fetch yöntemiyle karşılaştırılabilir.

Bu bir neden varsayımını sınayan değişikliktir. Önceki fetch yönteminin gövdeyi bozduğu, bağlantı yeniden kullanımının 504'e kesin neden olduğu veya hatanın giderildiği iddia edilmez. Yeni bağlantılar ek TLS maliyeti getirir; aynı süre sınırları korunarak canlı gecikme izlenmelidir.

- Acquire isteği 8 saniye, diğer Supabase istekleri 5 saniye sınırında kalır.
- Yalnız GET bağlantı/zaman aşımı hatası en fazla bir kez tekrar edilir. POST/RPC yazmaları tekrar edilmez.
- Başarısız POST'tan sonra farklı istemciye otomatik geçilip aynı işlem gönderilmez.
- Binance erişim yöntemi, finansal hesaplamalar, kilit SQL'i ve kaydedilmiş kullanıcı ayarları korunur.
- Hata diagnostic alanında kullanılan transport bilgisi vardır. HTTP yanıt başlığında X-KV2-Supabase-Transport bulunur.
- Sağlık kontrolü sürümü ve seçili istemciyi gösterir; gerçek Supabase/Binance bağlantısı testi olduğu anlamına gelmez.

## Kurulum

ZIP içeriğini kripto-v2 GitHub deposuna yükleyin. Yeni Vercel dağıtımı Ready olduğunda:

1. `https://kripto-v2.vercel.app/api/health` adresinde version=0.1.7 ve supabaseTransport=native görünmeli.
2. Yeni SQL ve anahtar değişikliği yok. SUPABASE_HTTP_TRANSPORT tanımlı değilse native seçilir.
3. En az 20 dakikalık cron sonucunu ve açık pozisyonların güncelleme zamanlarını gözlemleyin. 200/skipped=true veri taraması veya pozisyon koruması başarısı değildir. 200/skipped=false ve ilgili güncel koruma bilgisi gerekir.

SQL Editor / Database'de geçmiş yanıtları incelemek için:

```sql
select created as zaman, status_code as durum_kodu,
       left(content, 2000) as yanit
from net._http_response
order by created desc
limit 20;
```

Dağıtım öncesi satırları yeni yöntemin sonucuna katmayın. 504 sürerse diagnostic.transport, operation, elapsedMs, code, requestId alanlarıyla sorun takip edilebilir. Sağlayıcının istek kimliği varsa Supabase desteğine kullanıcı tarafından iletilebilir; otomatik destek mesajı gönderilmez.

## Doğrulama

69 yerel test ve derleme kontrolü geçti. Yeni istemci yerel ağ soketlerinde gerçek istek/yanıt aktarımıyla sınandı: Türkçe JSON bayt sayısı, ayrı bağlantılar, yarım kalan yanıt, abort, 504 ayrıntıları, yönlendirmeme ve yazmama tekrarları. Ayrıca geçici bir yerel sertifikayla TLS denemesi yapıldı: güvenilmeyen sertifika reddedildi, test CA ile doğrulanan HTTPS başarılı oldu. Test sertifikası/anahtarı pakette yok. Bu kontroller canlı Vercel/Supabase sonucunu kanıtlamaz.

## Geri dönüş

Önceki Vercel dağıtımına dönün. Alternatif olarak Production ortamına SUPABASE_HTTP_TRANSPORT=fetch ekleyip Redeploy yapın; eski bağlantı yöntemi seçilir, diğer 0.1.7 teşhis bilgileri korunur. Sağlık kontrolünde supabaseTransport=fetch görünmeli. SQL geri alma gerekmez. Yeni yönteme dönmek için native yazıp tekrar dağıtın. İki yöntem aynı yazma isteği üzerinde paralel denenmez.
