# 0.1.4 — Hesap kilidi ve bekleme durumu

Gözlenen hata: `Supabase — hesap kilidi alma: 5 saniyelik süre sınırı aşıldı.` Bu, RPC yanıtının süre sınırında alınamadığını kanıtlar; satır kilidi beklemesi, bağlantı gecikmesi veya sunucu yoğunluğundan hangisinin neden olduğunu tek başına kanıtlamaz.

## Kurulum

1. Yalnız kripto-v2 Supabase projesinde ayrı verilen 004 SQL'ini çalıştırın. Paket içindeki karşılığı `supabase/migrations/202609140004_account_lock.sql` dosyasıdır. GitHub migration otomasyonu bunu zaten uyguladıysa tekrar çalıştırılması veri kaybı yaratmaz.
2. Tam ZIP içeriğini kripto-v2 GitHub deposuna yükleyin. Vercel dağıtımı Ready olduğunda `/api/health` sürümü 0.1.4 olmalı.
3. 001 ve 003 SQL'lerini tekrar çalıştırmayın. Gizli anahtar veya bölge değişikliği gerekmiyor.

## Değişiklikler

- Hesap varsa gereksiz INSERT denemesi kaldırıldı. Satır başka bir transaction tarafından tutuluyorsa NOWAIT ile hemen vazgeçilir. Yeni hesap açma yarışında ve tablo kilidinde bekleme 1 saniyeyle sınırlıdır.
- Kilit meşgulse null döner; uygulama normal işlemlerde kullanıcıya meşgul mesajı, cron'da ACCOUNT_BUSY ve skipped=true döndürür. Mevcut işlem kesilmez, kilit zorla temizlenmez.
- Yalnız hesap kilidi HTTP isteğinin toplam sınırı 5'ten 8 saniyeye çıkarıldı. Bu yazma isteği otomatik tekrar edilmez. Kilit süresi 55 saniye, hesap revizyonu ve kayıt atomikliği korunur.
- Bekleme turlarında message artık güncel bekleme bilgisidir. Eski piyasa hatası previousError alanındadır. 200/skipped=true, Binance'in erişilebilir olduğunu göstermez.
- Zaman aşımı gerçek hata olarak 503 döner; meşgul veya başarılı gibi gizlenmez.

## Doğrulama

Yerel Node testleri bekleme mesajının ayrılmasını, meşgul hesabın işlem açmamasını ve kilit zaman aşımının tek RPC/503 olarak kalmasını kontrol eder. Gerçek PostgreSQL/Supabase üzerinde SQL çalıştırılmadı; eşzamanlı veritabanı davranışı canlı ortamda henüz doğrulanmadı.

SQL sonucu `Hesap kilidi güncellendi` olmalı. Son cron yanıtlarında WAITING veya ACCOUNT_BUSY tarama yapılmadığını belirtir. skipped=false olan yanıtı inceleyin. Yeni Supabase zaman aşımı devam ederse kalıcı bağlantı/veritabanı beklemesi ayrıca incelenmelidir. 451'in giderildiği iddia edilmiyor.

## Geri dönüş

Vercel'de 0.1.3 dağıtımına dönülebilir. SQL davranışını da geri almak gerekirse yalnız `supabase/004_geri_al.sql` dosyasını çalıştırın. Bu dosya normal güncelleme sırasında çalıştırılmaz. Bakiye, ayarlar, geçmiş ve cron sırrı değişmez.
