-- AVAREN Sprint 9.3 patch: require exact email match at approval time.
-- Run after AVAREN_COACH_CONNECTION_REQUESTS_9_3_MIGRATION.sql.

begin;

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

  if lower(trim(coalesce(v_client.email, ''))) <> lower(trim(coalesce(v_request.athlete_email, ''))) then
    raise exception 'business_client_email_mismatch';
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

commit;
