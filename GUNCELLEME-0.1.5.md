# 0.1.5 — Supabase hata ayrıntıları

Yeniden başlatma sonrasında bir tur `Açık pozisyon sınırı` sonucuyla tamamlandı, takip eden iki turda Supabase HTTP 504 döndü. Sürekli çalışma düzelmiş sayılmaz. Açık pozisyon koruması tick içinde giriş sınırından önce çalışır; hata olan sonraki turlarda koruma tamamlandı varsayılamaz.

## Amaç

Önceki sürüm Supabase HTTP hata yanıtındaki `code` alanını genel bir mesajla gizliyordu. Bu nedenle 504'ün API bağlantı havuzu, sorgu iptali veya ayrıntı vermeyen ağ geçidi yanıtı olduğu ayırt edilemiyordu. Bu sürüm teşhis içindir; bağlantı sorununun kesin çözümü olduğu iddia edilmez.

- Hata mesajında işlem aşaması, HTTP durumu ve geçerli hata kodu gösterilir.
- Cron yanıtında diagnostic alanı bulunur: işlem, HTTP durumu, hata kodu, geçen milisaniye, varsa Supabase istek kimliği.
- PGRST003 yalnız gerçekten sunucu kodunda veya Proxy-Status başlığında varsa bağlantı havuzu beklemesi olarak açıklanır. Kodsuz 504 için neden uydurulmaz.
- Ham hata metni, SQL, anahtar, Authorization, istek gövdesi ve tam URL paylaşılmaz.
- Mutasyon tekrarları, süre sınırları, işlem ayarları ve SQL bu sürümde değiştirilmez.

## Uygulama

Tam ZIP içeriğini kripto-v2 GitHub deposuna yükleyin. Vercel Ready sonrasında `/api/health` 0.1.5 göstermeli. Yeni SQL, gizli anahtar, yeniden başlatma veya bölge değişikliği gerekmiyor.

Sonraki 503 yanıtını Supabase SQL Editor'da okuyun:

```sql
select created as zaman, left(content, 2000) as yanit
from net._http_response
where status_code=503
order by created desc
limit 3;
```

Yeni dağıtımın saatinden sonraki hatayı esas alın. Eski hata satırlarında diagnostic alanı bulunmaz. Açık pozisyon sınırını artırmak bağlantı sorununu çözmez. Hatalı turlarda güncel pozisyon kontrolü garanti edilmez.

## Test ve geri dönüş

Yerel testler PGRST003, Proxy-Status, kodsuz 504, sır içeren ham yanıtların gizlenmesi, KV2 hata eşlemesi ve cron uçtan uca sahte yanıtını kapsar. Canlı Supabase bağlantısı bu ortamdan test edilmedi. Geri dönüş için önceki Vercel dağıtımı yeterlidir; SQL geri alma gerekmez.
