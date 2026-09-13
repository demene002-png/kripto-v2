# 0.1.3 — Bağlantı zaman aşımını ayırma

Kullanıcının zamanlayıcı yanıtı artık 401 değil, 503 ve `The operation was aborted due to timeout` içeriyor. Yetkilendirme geçildi; hata mevcut kodun dış yakalama bloğundan geliyor. Bu, Supabase hesap okuma/kilit/kayıt isteklerini öne çıkarır; canlı iz olmadan hangi aşama olduğu kesin söylenemez.

## Değişiklik

- Supabase zaman aşımı mesajı artık kayıt okuma, oturum doğrulama, hesap kilidi alma veya hesap ve işlem geçmişi kaydetme aşamasını belirtir.
- Supabase GET okumaları yalnız zaman aşımı/bağlantı hatasında bir kez tekrar edilir. Her deneme 5 saniyeyle sınırlıdır. HTTP hata yanıtları tekrar edilmez.
- POST yazmaları otomatik tekrarlanmaz: yanıt gelmese bile veritabanı işlemi tamamlanmış olabilir. Mevcut hesap kilidi, revizyon kontrolü ve kilit süre sonu korunur.
- Binance 4 saniyelik sınırı korunur; zaman aşımı veri yolu adıyla gösterilir. Binance çağrılarında ek tekrar yoktur. 451 erişim engeli çözülmüş sayılmaz.
- Yanıt gövdesi okunurken oluşan zaman aşımı da aynı şekilde ele alınır; mesajlara URL, anahtar veya ham hata eklenmez.

## Yükleme ve kontrol

Tam ZIP içeriğini yalnız kripto-v2 deposuna yükleyin. Vercel dağıtımı Ready olduktan sonra `/api/health` sürümü 0.1.3 göstermeli. Supabase SQL veya gizli anahtar değişikliği gerekmiyor.

Bir sonraki dakikalık çağrıdan sonra mevcut `net._http_response` sorgusunun son yanıtına bakın. Hata devam ederse yeni mesajın hangi Supabase işlemini veya Binance yolunu belirttiğini paylaşın. Başarılı kontrol, tek başına yeni pozisyon açılması gerektiği anlamına gelmez.

Yerel hata benzetimleri gerçek Supabase/Vercel bağlantısını doğrulamaz. Bu paket kalıcı bağlantı sorununun çözüldüğü iddiasını taşımaz; geçici okuma hatasına sınırlı dayanıklılık ve teşhis sağlar.

## Geri dönüş

Vercel'de önceki dağıtıma dönün veya 0.1.2 ZIP içeriğini yeniden dağıtın. Veritabanı şeması değişmedi; zamanlayıcı kurulumu tekrar edilmez.
