-- kripto-v2 0.1.0: yalnız YENİ Supabase projesinde çalıştırın.
-- Eski kripto tablolarını değiştirmez. Temiz V2 kurulumu; DROP/TRUNCATE içermez.
begin;
create table if not exists public.kv2_accounts (
  user_id uuid primary key references auth.users(id),
  state jsonb not null,
  revision bigint not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state)='object'),
  check ((state->>'balance')::numeric >= 0),
  check ((state->'settings'->>'leverage')::int between 1 and 50)
);
create table if not exists public.kv2_events (
  user_id uuid not null references public.kv2_accounts(user_id),
  event_id text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,event_id)
);
create table if not exists public.kv2_research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.kv2_accounts(user_id),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists kv2_events_history on public.kv2_events(user_id,kind,created_at desc);
create index if not exists kv2_research_history on public.kv2_research(user_id,created_at desc);
alter table public.kv2_accounts enable row level security;
alter table public.kv2_events enable row level security;
alter table public.kv2_research enable row level security;
-- Users can read their own records only. All mutations go through server-only RPCs.
create policy kv2_account_read on public.kv2_accounts for select to authenticated using ((select auth.uid())=user_id);
create policy kv2_events_read on public.kv2_events for select to authenticated using ((select auth.uid())=user_id);
create policy kv2_research_read on public.kv2_research for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.kv2_accounts,public.kv2_events,public.kv2_research from anon,authenticated;
grant select on public.kv2_accounts,public.kv2_events,public.kv2_research to authenticated;
grant all on public.kv2_accounts,public.kv2_events,public.kv2_research to service_role;

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

create or replace function public.kv2_commit(p_user uuid,p_token uuid,p_revision bigint,p_state jsonb,p_events jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare a public.kv2_accounts; e jsonb;
begin
  select * into a from public.kv2_accounts where user_id=p_user for update;
  if not found or a.lease_token is distinct from p_token or a.revision<>p_revision or a.lease_until<clock_timestamp() then
    raise exception 'KV2_CONFLICT: İşlem kilidi veya sürümü değişti; yeniden deneyin.';
  end if;
  if jsonb_typeof(p_state->'positions')<>'array' or jsonb_array_length(p_state->'positions')>5 or
    (p_state->>'balance')::numeric<0 or (p_state->'settings'->>'leverage')::int not between 1 and 50 then
    raise exception 'KV2_INVALID: Hesap değerleri geçersiz.';
  end if;
  for e in select value from jsonb_array_elements(p_events) loop
    insert into public.kv2_events(user_id,event_id,kind,payload) values(p_user,e->>'id',e->>'kind',e);
  end loop;
  update public.kv2_accounts set state=p_state,revision=revision+1,lease_token=null,lease_until=null,updated_at=now() where user_id=p_user;
  return a.revision+1;
end $$;

create or replace function public.kv2_release(p_user uuid,p_token uuid)
returns void language sql security definer set search_path='' as $$
  update public.kv2_accounts set lease_token=null,lease_until=null where user_id=p_user and lease_token=p_token;
$$;

create or replace function public.kv2_save_research(p_user uuid,p_result jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  insert into public.kv2_research(user_id,result) values(p_user,p_result) returning id into result_id;
  return result_id;
end $$;

revoke all on function public.kv2_acquire(uuid,uuid,jsonb),public.kv2_commit(uuid,uuid,bigint,jsonb,jsonb),public.kv2_release(uuid,uuid),public.kv2_save_research(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kv2_acquire(uuid,uuid,jsonb),public.kv2_commit(uuid,uuid,bigint,jsonb,jsonb),public.kv2_release(uuid,uuid),public.kv2_save_research(uuid,jsonb) to service_role;
commit;
