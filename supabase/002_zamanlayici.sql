-- 001 kurulumundan, Vercel yayını ve manuel tarama testinden SONRA çalıştırın.
-- Yalnız bu üç yer tutucuyu değiştirin. CRON_SECRET Vercel ile aynı olmalı.
-- Bu dosya migration klasörü dışında: otomatik olarak uygulanmaz.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://SIZIN-KRIPTO-V2.vercel.app/api/v2-cron', 'kv2_runner_url');
select vault.create_secret('VERCELDEKI_EN_AZ_32_KARAKTER_CRON_SECRET', 'kv2_cron_secret');

select cron.schedule('kripto-v2-dakikalik', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='kv2_runner_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kv2_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$job$);

-- DURDURMA (gerektiğinde ayrı çalıştırın; tablo/işlem silmez):
-- select cron.unschedule('kripto-v2-dakikalik');
-- TEKRAR KURULUM: önce mevcut cron işini unschedule ile kaldırın.
-- Sırları tekrar create_secret ile çoğaltmayın; Vault ekranından güncelleyin.
