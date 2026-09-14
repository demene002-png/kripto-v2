# 0.1.6 — Küçük coin fiyatlarının gösterimi

Açık işlemlerde giriş, güncel fiyat, zarar durdurma, hedef ve tahmini tasfiye fiyatları sabit dört ondalık basamakla gösteriliyordu. PUMP gibi düşük fiyatlı coinlerde farklı seviyeler aynı görünebiliyordu.

Bu beş alan artık fiyat büyüklüğüne göre en fazla 12 anlamlı basamakla Türkçe gösterilir. Örneğin `0.0036215`, `0.0036041` ve `0.0035982` artık sırasıyla `0,0036215`, `0,0036041` ve `0,0035982` görünür. Gereksiz son sıfırlar eklenmez; eksik veya geçersiz fiyat çizgiyle gösterilir. Gösterim Binance fiyat adımına yuvarlama işlemi değildir.

Bu değişiklik yalnız ekrandaki metne uygulanır. İşlem hesaplamaları, kaydedilmiş fiyatlar, bakiye, komisyon, kaldıraç ve zarar durdurma kuralları değiştirilmez. Supabase 504 sorunu için yeni bir bağlantı düzeltmesi içermez.

## Yükleme

Tam ZIP içeriğini kripto-v2 GitHub deposuna yükleyin. Vercel Ready olduğunda uygulamayı Ctrl+F5 ile yenileyin. Alt bilgide sürüm 0.1.6 görünmeli. Yeni SQL veya ortam değişkeni gerekmiyor.

## Kontrol ve geri dönüş

PUMP benzeri coinlerde beş fiyat alanını kontrol edin. Örnek küçük/büyük fiyatların, Türkçe sayı biçiminin ve eksik verinin yerel kontrolü ile kaynak derleme kontrolü yapıldı. Canlı tarayıcı görüntüsü doğrulanmadı. Gerektiğinde önceki Vercel dağıtımına dönmek yeterlidir; veritabanı geri alma işlemi yoktur.
