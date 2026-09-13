# Kripto V2 — 0.1.1 sanal deneme paketi

**Mevcut kurulumdan güncelliyorsanız önce `GUNCELLEME-0.1.1.md` dosyasını okuyun. SQL'i yeniden çalıştırmayın.** Giriş bağlantısı için açık `.js` API yolları ve Türkçe HTTP hata kontrolleri eklendi; toplam 38 yerel test geçti. Canlı Vercel doğrulaması henüz yapılmadı.

**1.000 USDT sanal başlangıç · 1x–50x · yükseliş/düşüş · günlük kâr hedefi yok.**

Bu paket mevcut `kripto`dan bağımsızdır. Yalnız Binance public USDⓈ-M vadeli piyasa verisi okur. Borsaya gerçek veya Testnet emri göndermez. Binance anahtarı istemez.

## Paket durumu

Çekirdek, HTTP erişim ve geçmiş test doğrulaması: **30/30 test başarılı**. Statik kaynak/build kontrolü başarılı. Canlı Binance bağlantısı bu çalışma ortamında zaman aşımına uğradı; Supabase/Vercel hesabına bağlanılmadı. Gerçek veritabanı entegrasyonu, otomasyon ve görsel tarayıcı testi henüz doğrulanmadı. Bu paketi ilk kurulum ve sanal kabul testi için kullanın.

## 1. GitHub

Hedef: `deneme002-png/kripto-v2`.

ZIP'i bilgisayarınızda açın. **İçindeki dosya ve klasörleri** deponun ana dizinine yükleyin. ZIP'in kendisini veya ayrıca üstte bir `kripto-v2/` klasörü yüklemeyin. `package.json`, `vercel.json`, `agent.md`, `public/`, `api/`, `core/`, `server/`, `supabase/` aynı seviyede olmalı. `.env.example` ve `.gitignore` dosyalarını da dahil edin; gerçek `.env` yüklemeyin.

## 2. Yeni Supabase projesi

1. Eski `kripto`dan **farklı** projede olduğunuzu doğrulayın.
2. SQL Editor'da `supabase/migrations/202609130001_initial.sql` dosyasını **bir kez** çalıştırın. Hata varsa otomasyona geçmeyin. Tüm kurulum tek transaction içindedir; hata durumunda tamamı geri alınır.
3. Authentication / URL Configuration altında Site URL'yi yeni Vercel adresiniz yapın. İlk hesabı uygulamadaki “Yeni hesap oluştur” ile açabilirsiniz. E-posta onayı açıksa onaylayıp giriş yapın.

Supabase GitHub bağlantı ekranınız:

| Alan | Değer |
|---|---|
| GitHub repository | `deneme002-png/kripto-v2` |
| Working directory | `.` |
| Deploy to production | İlk kurulumda **kapalı** |
| Production branch name | Alan görünüyorsa `main` |
| Automatic branching | Kapalı |

`Enable integration` seçilebilir; Pro yükseltmesi gerekmez. SQL'i ilk aşamada elle çalıştıracağımız için aynı migration'ın otomatik tekrar çalıştırılmasını açmayın. Sonradan otomatik dağıtıma geçerken migration geçmişini önce eşleştirmek gerekir.

## 3. Yeni Vercel projesi

GitHub'daki `kripto-v2` deposunu **ayrı** Vercel projesine aktarın.

| Ayar | Değer |
|---|---|
| Framework Preset | Other |
| Root Directory | Depo kökü; boş bırakın |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Node.js | 22 veya üstü |

Environment Variables:

| Ad | Yeni Supabase/V2 değeri |
|---|---|
| `SUPABASE_URL` | `https://yeni-proje-ref.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Yeni projenin publishable/anon anahtarı |
| `SUPABASE_SECRET_KEY` | Yeni projenin sunucu secret/service_role anahtarı |
| `CRON_SECRET` | En az 32 karakter rastgele gizli değer |

Özel anahtarları sohbet, ekran görüntüsü veya GitHub'a koymayın. Değişken ekledikten sonra yeniden Deploy yapın. VITE_ veya NEXT_PUBLIC_ öneki kullanmayın. Sunucu anahtarı istemciye açılmaz.

## 4. İlk kontrol

1. Giriş sonrası 1.000 USDT görünmeli. İkinci giriş bakiyeyi yeniden başlatmamalı.
2. Kaldıracı değiştirip “Ayarları kaydet”, sonra sayfayı yenile: değer korunmalı.
3. “Şimdi tara”ya bas. Binance erişimi varsa karar günlüğü dolmalı. Henüz otomatik işlem kapalıdır; uygun sinyal sadece listelenir.
4. Bölge/451/zaman aşımı varsa veri hatası görünür ve yeni pozisyon açılmaz. **Hatalı veriyi spot fiyatı veya rastgele veriyle telafi etmeyin.**
5. `tests/SUPABASE_KABUL.md` listesini tamamlayın. Ardından otomatik işlemi açıp kaydedin.
6. Koşul uygun değilse işlem açmaması beklenen davranıştır. Günlük kâr hedefi, zorunlu işlem sayısı veya kâr nedeniyle durma yoktur.

## 5. Dakikalık otomasyon

İlk tarama çalıştıktan sonra `supabase/002_zamanlayici.sql` dosyasındaki Vercel adresi ve gizli değeri değiştirin. Gizli değer Vercel `CRON_SECRET` ile aynı olmalı. Bu dosyayı yeni Supabase SQL Editor'da çalıştırın. Vault uzantısı Supabase projesinde etkin olmalıdır.

Zamanlayıcı ekranında `kripto-v2-dakikalik` görünmeli. Panel kapalıyken iki–üç dakika bekleyip yeniden açın: son tur zamanı ilerlemeli. Supabase `cron.job_run_details`, `net._http_response` ve Vercel çalışma günlüklerini kontrol edin. Bir cron görevinin “başarılı” olması HTTP uygulamasının sağlıklı olduğu anlamına gelmez; yanıt kodu ve panel durumu da kontrol edilir.

Vercel Hobby yerleşik Cron günde bir kezle sınırlı olduğundan tetikleyici Supabase'dedir. Hesaplama Vercel'de kalır. Ücretsiz kullanım kapasitesi sınırsız değildir; kullanılan kota izlenmelidir.

## 6. Risk ve muhasebe

- İlk ayarlar: 5x, işlem başına %0,5 risk, günlük %3 zarar sınırı, zirveden %8 düşüş sınırı, %2 toplam açık risk, en fazla 3 pozisyon. Bunlar test varsayımlarıdır; kullanıcı tarafından değiştirilebilir.
- 50x seçilebilir fakat stop ile tasfiye tamponu uygun değilse işlem açılmaz. “50x seçtim, neden almadı?” sorusunun cevabı karar gerekçesinde görünür.
- Teminat = pozisyon büyüklüğü / kaldıraç. Gerçekleşen K/Z zaten pozisyon miktarını içerir; tekrar kaldıraçla çarpılmaz.
- Her yönde varsayılan %0,05 komisyon, 5 baz puan fiyat kayması. Gerçek hesap komisyonu değildir; simülasyon varsayımıdır.
- Gerçekleşmiş fonlama oranları public geçmişten alınır. Fonlama olayı yalnız bir kez yazılır.
- Stoplar mark fiyatıyla tetiklenir; kapanış gözlenen bid/ask ve kaymayla hesaplanır.
- Tasfiye sabit %1 bakım teminatı + çıkış komisyonu üzerinden yaklaşık izole modeldir. Coin/hesap kademeleri, sigorta/ADL, çapraz teminat ve Binance'in gerçek tasfiye formüllerinin tam eşdeğeri değildir.
- Günlük dönem Türkiye tarihine göre belirlenir; yeni gündeki ilk hesap gözlemi başlangıç özsermayesi olur. Kesintide tam gece yarısı değerlemesi garanti edilmez. Azami düşüş devre kesicisi kalıcıdır; sadece günlük kâr gerçekleşti diye sınırlar kaldırılmaz.

## 7. Strateji laboratuvarı

Coin başına yaklaşık son 10 gün / 1000 adet 15 dakikalık kapanmış mum. Gerçek sözleşme ve mark mumları + fonlama geçmişi kullanır. Karar önceki mumda, giriş sonraki mum açılışında. Aynı mumda çakışmada tasfiye/stop önceliklidir.

Üç büyüyen eğitim penceresinde 9 ATR/hedef parametre kombinasyonu denenir; seçilen kombinasyon sıradaki ayrı dönemde sınanır. Yeterli eğitim işlemi yoksa mevcut ayarlarda kalır. Dört stratejinin tek tek çıkarılmasıyla örneklem içi katkı farkı gösterilir. Hiçbir araştırma sonucu portföyü veya ayarları değiştirmez.

**Bu aşama çok yıllık/çok coin portföy doğrulaması değildir.** Güncel evren seçimi geçmişte kapanmış coinleri kapsamaz. Canlı taramadaki Bitcoin piyasa ve portföy korelasyon veto katmanları tek coin replay'inde yoktur. Uzun dönem, tarihsel evren ve portföy eşdeğerliği sonraki araştırma aşamasıdır. Kısa geçmişte kâr, sonraki işlemlerde kâr garantisi değildir.

## 8. Yerelde çalıştırma

Node 22+ gerekir. Üretim bağımlılığı yok.

```sh
npm test
npm run build
npm run dev
```

`.env.example` dosyasını yerelde `.env` olarak kopyalayıp yalnız yeni proje bilgilerini doldurun. Anahtar yokken `http://localhost:3000/?preview=1` sadece açıkça etiketli boş arayüz önizlemesidir. Bu görünüm gerçek piyasa veya işlem sonucu üretmez.

İsteğe bağlı tarayıcı testi: Playwright + Chromium kurulu bir geliştirme ortamında, sunucu açıkken `node scripts/preview-check.mjs`. Bu paket oluşturulurken Chromium yoktu, test çalıştırılamadı.

## 9. Hata durumunda geri dönüş

1. Panelde “Yeni işlemleri durdur”. Bu manuel kapanışları engellemez.
2. Gerekirse açık sanal pozisyonları “Pozisyonu kapat” ile kapatın.
3. SQL: `select cron.unschedule('kripto-v2-dakikalik');`
4. V2 Vercel projesinde önceki uyumlu dağıtıma dönün. `kv2_accounts` ve `kv2_events` verilerini silmeyin.
5. Eski `kripto` deposu/veritabanı etkilenmez. Hatalı muhasebe kaydı varsa silmek yerine doğrulanmış bir telafi migration'ı hazırlanmalıdır.

## Kaynaklar

- Binance public futures veri sözleşmeleri: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data
- Supabase GitHub ayarları: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase zamanlayıcısı: https://supabase.com/docs/guides/cron
- Vercel cron sınırları: https://vercel.com/docs/cron-jobs/usage-and-pricing

İlk paketin gerçek durumu ve sonraki zorunlu işler `agent.md` içindedir.
