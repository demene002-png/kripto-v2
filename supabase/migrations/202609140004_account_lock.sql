-- Yalnız kripto-v2 projesi. Veri silmez, bakiye/ayar/geçmiş değiştirmez.
-- Mevcut kv2_acquire imzası ve yetkileri korunur; tekrar çalıştırılabilir.
begin;
set local lock_timeout='2s';
create or replace function public.kv2_acquire(p_user uuid,p_token uuid,p_initial jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare a public.kv2_accounts;
begin
  -- Var olan hesap için her tur INSERT denemesi yapma.
  select * into a from public.kv2_accounts where user_id=p_user for update nowait;
  if not found then
    insert into public.kv2_accounts(user_id,state) values(p_user,p_initial) on conflict do nothing;
    select * into a from public.kv2_accounts where user_id=p_user for update nowait;
  end if;
  if a.lease_until>clock_timestamp() then return null; end if;
  update public.kv2_accounts set lease_token=p_token,lease_until=clock_timestamp()+interval '55 seconds' where user_id=p_user;
  return jsonb_build_object('state',a.state,'revision',a.revision);
exception when lock_not_available then
  -- Bu bloktaki değişiklikler geri alınır. Diğer işlemin kilidini bozma.
  return null;
end $$;
revoke all on function public.kv2_acquire(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kv2_acquire(uuid,uuid,jsonb) to service_role;
commit;
select 'Hesap kilidi güncellendi' as sonuc;
