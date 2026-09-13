-- KRIPTO-V2: sayfa kapaliyken dakikalik tetikleme kur/guncelle.
-- SADECE kripto-v2 Supabase projesinde calistirin. 001 SQL'ini tekrar calistirmayin.
-- Vercel'de CRON_SECRET tanimli olmali. Asagidaki yer tutucuyu AYNI degerle degistirin.
-- Deger burada yokken mevcut Vault sirri varsa korunur; yoksa kurulum durur.
-- Vercel adresi kullanicinin ekranindaki kripto-v2.vercel.app icin dolduruldu.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $setup$
declare
  v_url text := 'https://kripto-v2.vercel.app/api/v2-cron';
  v_secret text := 'VERCEL_CRON_SECRET_BURAYA';
  v_id uuid;
  v_count int;
begin
  if (select count(*) from vault.secrets where name='kv2_runner_url')>1 or
     (select count(*) from vault.secrets where name='kv2_cron_secret')>1 then
    raise exception 'Ayni adla birden fazla Vault kaydi var; yeni kayit olusturmadan once inceleyin.';
  end if;

  select id into v_id from vault.secrets where name='kv2_runner_url';
  if v_id is null then
    perform vault.create_secret(v_url,'kv2_runner_url');
  else
    perform vault.update_secret(v_id,v_url);
  end if;

  select id into v_id from vault.secrets where name='kv2_cron_secret';
  if v_secret='VERCEL_CRON_SECRET_BURAYA' then
    if v_id is null then raise exception 'Once VERCEL_CRON_SECRET_BURAYA alanini Verceldeki CRON_SECRET ile doldurun.'; end if;
    if (select length(decrypted_secret) from vault.decrypted_secrets where id=v_id)<32 then
      raise exception 'Mevcut CRON_SECRET en az 32 karakter olmali.';
    end if;
  else
    if length(v_secret)<32 then raise exception 'CRON_SECRET en az 32 karakter olmali.'; end if;
    if v_id is null then perform vault.create_secret(v_secret,'kv2_cron_secret');
    else perform vault.update_secret(v_id,v_secret); end if;
  end if;
end $setup$;

-- Ayni isimli is mevcutsa program guncellenir; ikinci tarama isi olusturulmaz.
select cron.schedule('kripto-v2-dakikalik','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='kv2_runner_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kv2_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
$job$);
commit;

-- Sir degerlerini gostermeyen kurulum kontrolu:
select jobname,schedule,active from cron.job where jobname='kripto-v2-dakikalik';
-- Gerektiginde sadece zamanlayiciyi durdurmak icin AYRI calistirin:
-- select cron.unschedule('kripto-v2-dakikalik');
