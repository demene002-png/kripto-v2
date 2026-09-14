-- Yalnız 004 kilit fonksiyonunu geri alır; normal kurulumda ÇALIŞTIRMAYIN.
begin;
set local lock_timeout='2s';
create or replace function public.kv2_acquire(p_user uuid,p_token uuid,p_initial jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.kv2_accounts;
begin
  insert into public.kv2_accounts(user_id,state) values(p_user,p_initial) on conflict do nothing;
  select * into a from public.kv2_accounts where user_id=p_user for update;
  if a.lease_until>clock_timestamp() then return null; end if;
  update public.kv2_accounts set lease_token=p_token,lease_until=clock_timestamp()+interval '55 seconds' where user_id=p_user;
  return jsonb_build_object('state',a.state,'revision',a.revision);
end $$;
revoke all on function public.kv2_acquire(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kv2_acquire(uuid,uuid,jsonb) to service_role;
commit;
