# 0.1.2 — Otomatik kontrol

Ayar paneli de sadeleştirildi: otomatik işlem, kaldıraç ve aynı anda açık işlem sayısı önde; kalan seçenekler Gelişmiş ayarlar altında. Kayıtlı risk sınırları özet halinde görünür, mevcut ayar değerleri değiştirilmez.

## Sayfa açıkken

Tam ZIP içeriğini mevcut `kripto-v2` GitHub deposuna yükleyin. Yeni Vercel dağıtımı Ready olunca Ctrl+F5 ile yenileyin. Giriş yaptıktan sonra manuel düğmeye basmadan ilk kontrol yapılır. Normal aralık yaklaşık 60–75 saniyedir; görünmeyen sekmelerde tarayıcı işi çalıştırılmaz.

Bu otomatik **kontrol** özelliğidir. Mevcut otomatik işlem açma ayarı aynen korunur; kapalıysa yalnız tarama yapılır. Açık pozisyonlar ayrıca korunmaya çalışılır. 1.000 USDT, kaldıraç ve geçmiş kayıtları sıfırlanmaz.

Hata varsa tekrar aralığı 2, 4, 8, 15 dakika olur ve 15 dakikada kalır. Başarıda normal aralığa döner. Bekleme bilgisi Supabase hesabında saklanır, sayfa yenileme bu süreyi sıfırlamaz. Aynı hesaba birden fazla sekme/cron geldiğinde sunucu kilidi ve kontrol zamanı çift turu engeller.

## Sayfa kapalıyken

`supabase/003_otomatik_kontrol.sql` dosyasını kullanın. Bu dosya ilk tablo kurulumunu tekrarlamaz.

1. Vercel Environment Variables içinde **CRON_SECRET** adlı en az 32 karakter rastgele gizli değer bulunmalı; eklediyseniz Redeploy yapın.
2. SQL dosyasında `VERCEL_CRON_SECRET_BURAYA` yerine aynı değeri yazın. Değer özel kalmalı; sohbet veya GitHub'a yüklemeyin. Önceden Vault'ta kurulmuş geçerli değer varsa yer tutucu aynen bırakılabilir; kayıt korunur.
3. Dosyayı yalnız yeni `kripto-v2` Supabase projesinin SQL Editor'ında çalıştırın. Adres `https://kripto-v2.vercel.app/api/v2-cron` olarak hazırdır.
4. Sonuçta `kripto-v2-dakikalik`, `* * * * *`, `active=true` görünmeli. Bu yalnız kurulum kanıtıdır; HTTP yanıtının başarısı ayrıca doğrulanmalıdır.
5. Uygulamayı kapatıp bir sonraki planlanan denemeden sonra açın. Son tur ilerlemeli. Hata beklemesi sırasında cron işi çalışsa bile piyasa isteği sonraki deneme saatine kadar ertelenir. Supabase HTTP yanıtını ve Vercel günlüklerini kontrol edin.

## Mevcut 451 hatası

Kullanıcı ekranında Binance public veri isteğine 451 yanıtı görüldü. Bu güncelleme 451 erişim reddini kaldırmaz; erişim olmadan yeni pozisyon açılmaz. Vercel'de kullanılan veri hizmetinin erişim koşulları ayrıca çözülmelidir. Proxy, VPN veya farklı kaynakla erişim engelini atlatma eklenmedi. Hata gizlenmez.

Otomatik kontrolün çalışması, veri bağlantısının sağlıklı olduğu anlamına gelmez. Sayfa açık kontrolü ve arka plan cron farklıdır. Bu paket hazırlanırken hesaplara bağlanıp cron kurulmadı; SQL'i uygulamanız gerekir.

## Geri dönüş

Eski uygulama sürümüne dönülebilir; tablo migration'ı yok. Arka plan işini durdurmak için yalnız `select cron.unschedule('kripto-v2-dakikalik');` çalıştırılır. İşlem tabloları silinmez. Panelde yeni girişleri duraklatmak, açık pozisyonların kontrolünü durdurmaz.
