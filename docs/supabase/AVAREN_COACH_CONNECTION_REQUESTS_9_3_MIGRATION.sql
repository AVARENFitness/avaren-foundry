-- AVAREN Sprint 9.3 — Self-Serve Coach Connection Requests
-- Safe athlete-initiated account -> business-client linking.
-- Does NOT auto-match or auto-link. Coach approval is required.
--
-- Canonical identity:
--   coach_business_clients.id = permanent business/client identity
--   linked_user_id            = optional AVAREN account connection
--   coach_clients             = active connected-coaching access bridge

begin;

do $$
begin
  if to_regclass('public.coach_business_clients') is null then
    raise exception 'Missing dependency: public.coach_business_clients';
  end if;
  if to_regclass('public.coach_clients') is null then
    raise exception 'Missing dependency: public.coach_clients';
  end if;
  if to_regclass('public.coach_allowlist') is null then
    raise exception 'Missing dependency: public.coach_allowlist';
  end if;
  if to_regprocedure('public.is_avaren_coach()') is null then
    raise exception 'Missing dependency: public.is_avaren_coach()';
  end if;
  if to_regprocedure('public.coach_local_business_date(text)') is null then
    raise exception 'Missing dependency: public.coach_local_business_date(text)';
  end if;
end $$;

create table if not exists public.coach_connection_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  athlete_email text not null default '',
  status text not null default 'pending'
    check (status in ('pending','approved','declined','cancelled')),
  business_client_id uuid references public.coach_business_clients(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists coach_connection_requests_pending_unique
  on public.coach_connection_requests (coach_id, athlete_id)
  where status = 'pending';

create index if not exists coach_connection_requests_coach_status_idx
  on public.coach_connection_requests (coach_id, status, created_at desc);

create index if not exists coach_connection_requests_athlete_idx
  on public.coach_connection_requests (athlete_id, created_at desc);

alter table public.coach_connection_requests enable row level security;

revoke all on table public.coach_connection_requests from public, anon, authenticated;
grant select on table public.coach_connection_requests to authenticated;

drop policy if exists coach_connection_requests_select on public.coach_connection_requests;
create policy coach_connection_requests_select
on public.coach_connection_requests
for select
to authenticated
using (
  athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.is_avaren_coach())
);

create or replace function public.request_avaren_coach_connection(
  p_coach_email text default 'hello@avarenfitness.com'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_athlete_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_coach_email text := lower(trim(coalesce(p_coach_email, 'hello@avarenfitness.com')));
  v_coach_id uuid;
  v_request public.coach_connection_requests;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_athlete_email = '' then
    raise exception 'athlete_email_required';
  end if;

  if not exists (
    select 1
    from public.coach_allowlist ca
    where lower(ca.email) = v_coach_email
  ) then
    raise exception 'coach_not_available';
  end if;

  select u.id
  into v_coach_id
  from auth.users u
  where lower(coalesce(u.email, '')) = v_coach_email
  order by u.created_at asc
  limit 1;

  if v_coach_id is null then
    raise exception 'coach_account_not_found';
  end if;

  if v_coach_id = v_athlete_id then
    raise exception 'cannot_request_self';
  end if;

  if exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = v_coach_id
      and cc.athlete_id = v_athlete_id
  ) then
    raise exception 'already_connected';
  end if;

  select *
  into v_request
  from public.coach_connection_requests r
  where r.coach_id = v_coach_id
    and r.athlete_id = v_athlete_id
    and r.status = 'pending'
  order by r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'request', to_jsonb(v_request),
      'existing', true
    );
  end if;

  insert into public.coach_connection_requests (
    coach_id,
    athlete_id,
    athlete_email,
    status
  )
  values (
    v_coach_id,
    v_athlete_id,
    v_athlete_email,
    'pending'
  )
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'request', to_jsonb(v_request),
    'existing', false
  );
end;
$$;

revoke all on function public.request_avaren_coach_connection(text)
  from public, anon, authenticated;
grant execute on function public.request_avaren_coach_connection(text)
  to authenticated;

create or replace function public.cancel_own_coach_connection_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_request public.coach_connection_requests;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.coach_connection_requests
  set
    status = 'cancelled',
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id
    and athlete_id = v_athlete_id
    and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'connection_request_not_found';
  end if;

  return jsonb_build_object('ok', true, 'request', to_jsonb(v_request));
end;
$$;

revoke all on function public.cancel_own_coach_connection_request(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_own_coach_connection_request(uuid)
  to authenticated;

create or replace function public.approve_coach_connection_request(
  p_request_id uuid,
  p_business_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_request public.coach_connection_requests;
  v_client public.coach_business_clients;
  v_existing_business_client_id uuid;
  v_backfilled integer := 0;
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_request
  from public.coach_connection_requests r
  where r.id = p_request_id
    and r.coach_id = v_coach_id
    and r.status = 'pending'
  for update;

  if not found then
    raise exception 'connection_request_not_found';
  end if;

  select *
  into v_client
  from public.coach_business_clients bc
  where bc.id = p_business_client_id
    and bc.coach_id = v_coach_id
  for update;

  if not found then
    raise exception 'business_client_not_found';
  end if;

  if v_client.status = 'archived' then
    raise exception 'business_client_archived';
  end if;

  if v_client.linked_user_id is not null
     and v_client.linked_user_id is distinct from v_request.athlete_id then
    raise exception 'business_client_already_linked';
  end if;

  select bc.id
  into v_existing_business_client_id
  from public.coach_business_clients bc
  where bc.coach_id = v_coach_id
    and bc.linked_user_id = v_request.athlete_id
    and bc.id <> v_client.id
  limit 1;

  if v_existing_business_client_id is not null then
    raise exception 'athlete_already_linked_to_other_business_client';
  end if;

  select cc.business_client_id
  into v_existing_business_client_id
  from public.coach_clients cc
  where cc.coach_id = v_coach_id
    and cc.athlete_id = v_request.athlete_id;

  if v_existing_business_client_id is not null
     and v_existing_business_client_id is distinct from v_client.id then
    raise exception 'bridge_business_client_conflict';
  end if;

  update public.coach_business_clients
  set
    linked_user_id = v_request.athlete_id,
    email = case
      when coalesce(trim(email), '') = '' then v_request.athlete_email
      else email
    end,
    updated_at = now()
  where id = v_client.id;

  insert into public.coach_clients (
    coach_id,
    athlete_id,
    athlete_email,
    business_client_id
  )
  values (
    v_coach_id,
    v_request.athlete_id,
    v_request.athlete_email,
    v_client.id
  )
  on conflict (coach_id, athlete_id) do update
  set
    athlete_email = excluded.athlete_email,
    business_client_id = excluded.business_client_id
  where public.coach_clients.business_client_id is null
     or public.coach_clients.business_client_id = excluded.business_client_id;

  update public.coach_scheduled_sessions s
  set
    athlete_id = v_request.athlete_id,
    updated_at = now()
  where s.business_client_id = v_client.id
    and s.athlete_id is null
    and s.status = 'scheduled'
    and s.session_date >= public.coach_local_business_date(s.schedule_timezone);
  get diagnostics v_backfilled = row_count;

  update public.coach_connection_requests
  set
    status = 'approved',
    business_client_id = v_client.id,
    reviewed_at = now(),
    updated_at = now()
  where id = v_request.id;

  update public.coach_invitations
  set
    status = 'cancelled',
    responded_at = now()
  where coach_id = v_coach_id
    and lower(athlete_email) = lower(v_request.athlete_email)
    and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'business_client_id', v_client.id,
    'athlete_id', v_request.athlete_id,
    'future_appointments_backfilled', v_backfilled
  );
end;
$$;

revoke all on function public.approve_coach_connection_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_coach_connection_request(uuid, uuid)
  to authenticated;

create or replace function public.decline_coach_connection_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_request public.coach_connection_requests;
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  update public.coach_connection_requests
  set
    status = 'declined',
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id
    and coach_id = v_coach_id
    and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'connection_request_not_found';
  end if;

  return jsonb_build_object('ok', true, 'request', to_jsonb(v_request));
end;
$$;

revoke all on function public.decline_coach_connection_request(uuid)
  from public, anon, authenticated;
grant execute on function public.decline_coach_connection_request(uuid)
  to authenticated;

commit;
