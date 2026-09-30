-- AVAREN Sprint 9.3 — Canonical client/email integrity patch
-- Purpose:
--   1. One business-client record per coach/email (case-insensitive).
--   2. Reuse/reopen an existing business client instead of creating duplicates.
--   3. Allow an athlete connection request to reopen an archived client when
--      the request email exactly matches the archived business record.
--   4. Preserve passes, appointments, attendance, notes, and historical records.
--
-- Run after:
--   AVAREN_COACH_CONNECTION_REQUESTS_9_3_MIGRATION.sql
--   AVAREN_COACH_CONNECTION_REQUESTS_9_3_EXACT_EMAIL_PATCH.sql

begin;

create unique index if not exists coach_business_clients_coach_email_unique
  on public.coach_business_clients (coach_id, lower(trim(email)))
  where coalesce(trim(email), '') <> '';

create or replace function public.create_coach_business_client(
  p_first_name text,
  p_last_name text default '',
  p_preferred_name text default '',
  p_email text default null,
  p_phone text default null,
  p_started_at date default null,
  p_private_note text default null,
  p_schedule_timezone text default 'America/New_York'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_coach_id uuid := auth.uid();
  v_email text := nullif(lower(trim(p_email)), '');
  v_display_name text;
  v_client public.coach_business_clients;
  v_reused_existing boolean := false;
  v_reopened boolean := false;
begin
  if v_coach_id is null or not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  if coalesce(trim(p_first_name), '') = '' then
    raise exception 'first_name_required';
  end if;

  v_display_name := coalesce(
    nullif(trim(p_preferred_name), ''),
    nullif(trim(p_first_name), '') || case
      when coalesce(trim(p_last_name), '') <> '' then ' ' || trim(p_last_name)
      else ''
    end,
    'Client'
  );

  if v_email is not null then
    select *
    into v_client
    from public.coach_business_clients bc
    where bc.coach_id = v_coach_id
      and lower(trim(bc.email)) = v_email
    order by
      case when bc.status = 'active' then 0 else 1 end,
      bc.created_at asc
    limit 1
    for update;

    if found then
      v_reused_existing := true;
      v_reopened := v_client.status = 'archived';

      update public.coach_business_clients
      set
        first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
        last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
        preferred_name = coalesce(nullif(trim(p_preferred_name), ''), preferred_name),
        display_name = v_display_name,
        email = v_email,
        phone = coalesce(nullif(trim(p_phone), ''), phone),
        status = case when v_client.status = 'archived' then 'active' else status end,
        ended_at = case when v_client.status = 'archived' then null else ended_at end,
        updated_at = now()
      where id = v_client.id
      returning * into v_client;

      if coalesce(trim(p_private_note), '') <> '' then
        insert into public.coach_business_client_notes (
          business_client_id,
          coach_id,
          notes
        )
        values (v_client.id, v_coach_id, trim(p_private_note))
        on conflict (business_client_id) do update
        set notes = excluded.notes, updated_at = now();
      end if;

      return jsonb_build_object(
        'ok', true,
        'business_client_id', v_client.id,
        'display_name', v_client.display_name,
        'linked', v_client.linked_user_id is not null,
        'reused_existing', v_reused_existing,
        'reopened', v_reopened
      );
    end if;
  end if;

  insert into public.coach_business_clients (
    coach_id,
    linked_user_id,
    first_name,
    last_name,
    preferred_name,
    display_name,
    email,
    phone,
    status,
    started_at
  ) values (
    v_coach_id,
    null,
    coalesce(trim(p_first_name), ''),
    coalesce(trim(p_last_name), ''),
    coalesce(trim(p_preferred_name), ''),
    v_display_name,
    v_email,
    nullif(trim(p_phone), ''),
    'active',
    coalesce(
      p_started_at,
      public.coach_local_business_date(p_schedule_timezone)
    )
  )
  returning * into v_client;

  if coalesce(trim(p_private_note), '') <> '' then
    insert into public.coach_business_client_notes (
      business_client_id,
      coach_id,
      notes
    )
    values (v_client.id, v_coach_id, trim(p_private_note))
    on conflict (business_client_id) do update
    set notes = excluded.notes, updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'business_client_id', v_client.id,
    'display_name', v_client.display_name,
    'linked', false,
    'reused_existing', false,
    'reopened', false
  );
end;
$function$;

revoke all on function public.create_coach_business_client(text,text,text,text,text,date,text,text)
  from public, anon, authenticated;
grant execute on function public.create_coach_business_client(text,text,text,text,text,date,text,text)
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
  v_reopened boolean := false;
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

  if lower(trim(coalesce(v_client.email, ''))) <> lower(trim(coalesce(v_request.athlete_email, ''))) then
    raise exception 'business_client_email_mismatch';
  end if;

  if v_client.status = 'archived' then
    v_reopened := true;
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
    status = case when v_reopened then 'active' else status end,
    ended_at = case when v_reopened then null else ended_at end,
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
    'future_appointments_backfilled', v_backfilled,
    'reopened', v_reopened
  );
end;
$$;

revoke all on function public.approve_coach_connection_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_coach_connection_request(uuid, uuid)
  to authenticated;

commit;
