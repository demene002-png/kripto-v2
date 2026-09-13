# Canlı ortama bağlandıktan sonra sanal kabul testleri

Bu liste bu çalışma sırasında **çalıştırılmadı**; yeni Supabase/Vercel bağlantısı gerekir.

1. Yeni proje SQL'i hata vermeden tamamlanmalı. Tekrar çalıştırmak yerine başarısız transaction sonucunu kontrol edin.
2. Kullanıcı A ile kayıt/giriş: 1000 USDT, pozisyon yok. Çıkış/yeniden giriş: aynı hesap.
3. Kullanıcı B ile ayrı giriş: kendi 1000 USDT hesabı. A'nın user_id değerini kullanarak B'nin erişim token'ıyla `kv2_accounts`, `kv2_events`, `kv2_research` sorgulandığında A'ya ait hiçbir kayıt dönmemeli.
4. Authenticated ve anon rollerle `kv2_acquire`, `kv2_commit`, `kv2_release`, `kv2_save_research` çağrıları izin hatası vermeli; hesap tablosuna doğrudan insert/update/delete başarısız olmalı.
5. Kaldıraç 7x kaydet, yenile ve tekrar giriş yap: 7x kalmalı. Formu düzenlerken arka plan yenilemesi değeri değiştirmemeli. Başka sekmede ayar kaydı varsa eski sekmenin kaydı çatışma vermeli.
6. Public Binance verisi erişilebilirken “Şimdi tara”. Son tur, gerçek coinler, gerekçeler görünmeli. Otomatik işlem kapalıyken pozisyon açılmamalı.
7. Açık pozisyonda “Pozisyonu kapat”: bakiye, teminat, net K/Z ve kapanış geçmişi tek seferde güncellenmeli. Aynı id'ye iki eşzamanlı kapanış isteği tek kayıt üretmeli; ikincisi bekleme veya daha önce kapanmış sonuç vermeli.
8. Kilit alma sonrası sunucu kesintisini dene: 55 saniye sonunda yeni kilit alınabilmeli; eski kilitle commit reddedilmeli. Bakiye ve olay kaydı birlikte rollback olmalı.
9. Fonlama zamanı geçmiş bir sanal pozisyonda iki tur çalıştır: aynı pozisyon/tarih için tek fonlama olayı olmalı. Her kapanışta `net = gross - fees + funding + adjustment` ve hesap hareketi mutabık olmalı.
10. Yeni girişler duraklatılmışken manuel kapanış çalışmalı. Stablecoin filtresi alışları engellerken mevcut pozisyonun kapanışını engellememeli.
11. Yanlış CRON_SECRET: HTTP 401 ve hesapta değişiklik yok. Doğru secret: tur sonucu. İki ardışık çağrı çift pozisyon açmamalı.
12. Binance 451/429/zaman aşımı: açık Türkçe hata, rastgele veri yok, yeni giriş yok. Bir coinde veri hatası diğer doğrulanabilen açık pozisyonların korunmasını engellememeli.
13. Mobil ve masaüstünde login, ayar kaydı, tablo taşması, kapanış butonu ve gerçek geçmiş testi elle doğrulanmalı.
14. Veritabanı/hesap anahtarları tarayıcı ağında, kaynak dosyalarında veya ZIP'te görünmemeli. `/api/app?config=1` yalnız publishable key döndürmeli.
15. Cron iki–üç tur sonra tarayıcı kapalıyken çalışmayı sürdürmeli; Supabase HTTP yanıtı ve Vercel logları kontrol edilmeli. Vercel gerçek süreleri ölçülmeli.

Başarı tarihini ve gözlenen sonucu `agent.md` içine yazmadan bu testleri tamamlandı olarak işaretlemeyin.
