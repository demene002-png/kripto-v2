# kripto-v2 — Karar kaydı ve devam talimatları

## Yetki ve kimlik

- Kullanıcının onayladığı isim: `kripto-v2`. GitHub hedefi ekranda `deneme002-png/kripto-v2` olarak görüldü. Depoya bağlantı veya yazma bu çalışmada yapılmadı.
- Eski `kripto` ayrı kalır ve geliştirilmeye devam eder. Onun Supabase/Vercel bilgileri V2'de kullanılmaz.
- Kullanıcı kaynakların tam ZIP, SQL dosyalarının ayrıca teslimini ister.
- Her kritik mimari/risk/strateji değişikliği bu dosyaya aynı geliştirme turunda yazılmalı.
- V2 hiçbir koşulda gerçek Binance veya Testnet emri göndermez. Canlı işlem seçeneği eklemeyin.
- Başlangıç tek seferlik **1.000 USDT sanal bakiye**. Yenileme/giriş sıfırlama değildir.
- **1x–50x** kaldıraç. Her işlem 50x değildir. İlk uygulama varsayımı: kullanıcı ayarından seçilen 5x, izole sanal teminat, aynı coinde tek pozisyon, iki yön desteklenir. Kullanıcı ayrı seçim yaparsa kaydedin.
- **Günlük kâr hedefi ve kâr nedeniyle durdurma yok.** Risk, günlük zarar, sermaye düşüşü, korelasyon ve bekleme sınırları korunur.
- Türkçe arayüz. Ücretli/anahtarlı haber servisi bağımlılığı yok. Haber/LLM modülü bu ilk pakette bulunmaz; ileride isteğe bağlı eklenebilir.

## İncelenen önceki kaynak

`kripto-ai-asistan-supabase-v1.4.0-profesyonel-ucretsiz.zip` incelendi. Referans arşiv ve açılmış dosyaları değiştirilmedi. `agent.md` tamamı, `api/pro-lab.mjs` ve runner'ın ilgili bölümleri okundu.

Alınan ilkeler: sabit değerli taban varlıkları filtreleme, kapalı mumlar, EMA/RSI/ATR, strateji mutabakatı, dönen tarama grubu, manuel risk azaltıcı kapanış, Supabase kalıcılığı, Türkçe gerekçeler.

Taşınmayan kod: eski LIVE/TESTNET modülleri; spot-only maliyet tabanı; eski 100 USDT hesabı; günlük kâr koruma eşikleri. Eski laboratuvarda sinyal mumunun kapanışından giriş, aynı mum tepesinden iz süren stop ve yalnız 70/30 bölme görülüyordu. V2 yeni bir çekirdektir; o laboratuvar doğrudan kopyalanmadı. Eski RSI sıfır kayıpta 70 döndürüyordu; V2 100, düz seride 50 döndürür.

## 0.1.0 mimarisi

- Çalışma zamanı Node 22+ ESM. Statik HTML/CSS/JS + Vercel API. Üretim bağımlılığı yok; React/Vite/Next taşınmadı. Böylece ZIP doğrudan açılır ve kurulum indirmelerine bağımlı değildir.
- `core/engine.mjs`: saf strateji, risk, teminat, muhasebe. Ağ erişimi yok.
- `core/research.mjs`: aynı sinyal/pozisyon planı kullanılarak geçmiş replay, 3 genişleyen eğitim/doğrulama penceresi, 9 parametre kombinasyonu, strateji çıkarma karşılaştırması.
- `server/market.mjs`: yalnız `fapi.binance.com` public USDⓈ-M perpetual GET izin listesi. Spot verisiyle vadeli işlem taklidi yapılmaz. Bölgesel 451/erişim engelinde yeni işlem açılmaz; engeli atlatan kaynak değiştirme yok.
- `server/runner.mjs`: önce açık pozisyonlar, sonra en fazla 2 coin taraması, tur başına en fazla 1 giriş. Uygun aday yoksa işlem yok.
- `server/db.mjs`: Supabase Auth doğrulama, sunucu anahtarıyla RPC, 55 saniyelik hesap kilidi, sürüm denetimi. Eski kilit sahibi süresi dolunca yazamaz.
- `kv2_accounts.state`: hesap/ayar/pozisyon/son 200 kapanış/son 100 karar/son 500 varlık gözlemi. İlk sürümde atomik güncelleme için tek hesap durumu kullanılır.
- `kv2_events`: değiştirilmeyen giriş, fonlama ve kapanış muhasebe defteri; tüm kapanış geçmişi burada kalır. Arayüzde eski kayıtlar sayfalanır.
- `kv2_research`: portföyden bağımsız kalıcı deney sonuçları.
- Kullanıcıya yalnız kendi kayıtlarında RLS SELECT. Yazma hakkı yok; hesap RPC'leri yalnız service_role. Anahtarlar frontend'e aktarılmaz; config endpoint'i sadece URL/publishable key verir.
- Ayar sürümü hesap sürümünden ayrıdır. Otomatik tarama ayar kaydını gereksiz sürüm çatışmasına sokmaz. Form değişikliği sırasında polling formu ezmez.
- Cron: Supabase pg_cron + pg_net, Vault'taki URL/secret ile Vercel `/api/cron` POST. Vercel Hobby günlük cron kullanılmaz.

## Finansal hesap sözleşmesi

1. Giriş: miktar risk bütçesi / (ATR stop mesafesi + maliyet payı) ile bulunur. Teminat ve açık risk üst sınırları ayrıca uygulanır.
2. Pozisyon büyüklüğü = miktar × giriş fiyatı. Teminat = büyüklük / kaldıraç.
3. Serbest bakiyeden teminat + giriş komisyonu düşülür. Kaldıraç K/Z'ye tekrar çarpılmaz.
4. Brüt K/Z = yön × miktar × (çıkış − giriş).
5. Fonlama tarihsel gerçekleşmiş oran ve mark fiyatıyla hesaplanır. Pozitif oran long için ödeme, short için tahsilattır. Kimlik + fonlama zamanı tekil kayıttır.
6. Fonlama izole teminata yansır. Kapanışta teminat + brüt K/Z − çıkış komisyonu serbest bakiyeye döner.
7. Net K/Z tüm giriş/çıkış komisyonlarını, fonlamayı ve gerçekleşme fiyatındaki kaymayı içerir. Kayma ikinci kez düşülmez.
8. İzole simülasyonda dönen tutar en az 0'dır. Fiyat boşluğu nedeniyle doğan fark `adjustment` olarak gösterilir; gizlenmez. Bu model gerçek borsa iflas/ADL/sigorta kurallarının birebir karşılığı değildir.
9. Bakım teminatı varsayımı %1, komisyon her yönde %0,05, kayma her yönde 5 baz puan. Bunlar kullanıcıya açık **simülasyon parametreleridir**, Binance kullanıcısının gerçek kademeleri/komisyonu olduğu iddia edilmez.
10. Tasfiye mark fiyatıyla izlenir. Stop ile yaklaşık tasfiye arasında en az %0,3 fiyat mesafesi gerekir; 50x çoğu adayda reddedilebilir. Stopu sırf kaldıracı mümkün kılmak için daraltmayın.

## Sınırlar — tamamlanmış gibi sunmayın

- Bu sürüm **ilk kurulabilir sanal deneme paketi**. Üretimde doğrulanmış bot veya kârlılık kanıtı değildir.
- Yerel 30 çekirdek/veri/HTTP/replay testi geçti. Sözdizimi/build kontrolü geçti. Supabase/PostgreSQL yürütücüsü ve canlı hesap bilgileri yok: SQL/RLS/atomik eşzamanlılık gerçek veritabanında henüz çalıştırılmadı.
- Binance canlı veri denemesi bu çalışma ortamında zaman aşımına uğradı. Vercel bölgesinden futures public veri erişimi kurulumda doğrulanmalı.
- Playwright paketi var fakat Chromium yürütücüsü yok; görsel tarayıcı testi tamamlanamadı. `scripts/preview-check.mjs` hazırdır. Arayüzün çalıştırılmış olduğu iddia edilmemeli.
- Cron çağrısı başına 1 hesap işlenir, en eski güncellenen hesap seçilir. Tek kullanıcılı deneme için hedef yaklaşık 1 dakikadır; çok kullanıcılı hizmette sıklık kullanıcı sayısıyla düşer. Çok kullanıcılı sürümden önce bağımsız iş kuyruğu, öncelik ve yük testi gerekir.
- Stop/target yalnız gözlenen güncel mark fiyatında kontrol edilir. Kesinti sırasında fiyatın stopu geçip dönmesi saptanamaz. Fiyat boşluğunda stop fiyatından kusursuz gerçekleşme iddia edilmez; gözlenen alış/satış fiyatı kullanılır. Sürekli gözetim veya borsa-native koruma yok.
- Bir pozisyonda veri hatası olursa doğrulanabilen diğer pozisyonlar yönetilir; yeni giriş engellenir. Veri eksik pozisyon fiyatı uydurulmaz.
- Laboratuvar son yaklaşık 1000 adet 15m mum (yaklaşık 10 gün) üzerinde **tek coin** testi yapar. Çok yıllık/çok coin portföy backtesti, tarihsel evren, delist kapsamı ve canlı runner BTC/korelasyon veto eşdeğerliği bu sürümde yok. Bunu tam portföy backtesti diye adlandırmayın.
- Geçmiş mark mumlarıyla tetiklenen stop/hedef fiyatının sözleşme gerçekleşmesine eşitliği yaklaşık varsayımdır. Emir defteri geçmişi yok; sabit 1 bp tek yön spread varsayılır.
- Her doğrulama penceresi 1000 USDT ile başlar; toplam tek portföy eğrisi gibi birleştirilmez. Eğitimde 5 işlem bile yoksa optimizasyon seçimi yapılmaz; mevcut ayarlar korunur. Beş işlem istatistiksel yeterlilik kanıtı değildir.
- Strateji çıkarma sonuçları örneklem içi tanısal analizdir. Bağımsız nedensel veya gelecekteki katkı kanıtı değildir.
- Süre sınırları: dış istekler 4/5 saniye, tarama için kontrol noktaları. Vercel'de gerçek gecikme/yük testi henüz yapılmadı. Sonsuz çalışan işlem veya kendi kendini çağıran döngü yok.
- Haber modülü, iz süren/kısmi kâr alma, uzun süreli kalıcı araştırma kuyruğu, tarihsel çoklu portföy doğrulaması sonraki aşamada. Ana mimari bunlardan bağımsızdır.

## İlk kurulum kabul testi

README sırasını izleyin. SQL'i yalnız yeni Supabase projesine uygulayın. Önce kayıt/giriş, 1000 bakiye, ayar yenileme, manuel tarama ve veri durumunu kontrol edin. Otomasyonu açmadan önce iki farklı kullanıcıyla RLS ve aynı pozisyona eşzamanlı iki kapanış testini gerçek DB'de doğrulayın. `tests/SUPABASE_KABUL.md` zorunlu kontrol listesidir.

## Geri dönüş

Önce yeni girişleri duraklatın, gerekiyorsa açık sanal pozisyonları kapatın, yalnız `kripto-v2-dakikalik` cron işini durdurun. V2 GitHub/Vercel sürümünü önceki uyumlu sürüme döndürün. `kv2_events` ve hesap tablolarını silmeyin. Eski `kripto`ya dokunmayın. Muhasebe hatası geçmişi silmekle giderilmez; ayrı telafi olayı ve yeni migration gerekir.
