-- AVAREN Sprint 9.1 — Durable Workout History + Multi-Device Safety
-- Idempotent: safe to run multiple times.
-- If athlete_workout_sessions already exists, essential schema/constraints are
-- verified and incompatible drafts abort with a clear exception.
--
-- Depends on:
--   • auth.users
--   • public.foundry_state
--   • public.coach_clients (coach read policy)
--
-- Does NOT delete legacy foundry_state.history.
-- Athletes may SELECT/INSERT/UPDATE own sessions; DELETE is denied.
-- Immutable after insert: id, athlete_id, session_id, created_at, source, assignment_id.

begin;

do $$
begin
  if to_regclass('public.foundry_state') is null then
    raise exception 'Missing dependency: public.foundry_state';
  end if;
end $$;

-- Optional revision column for safer whole-state upserts
alter table public.foundry_state
  add column if not exists state_revision bigint not null default 0;

create table if not exists public.athlete_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  assignment_id uuid null,
  workout_name text not null default 'Workout',
  workout_key text not null default '',
  started_at timestamptz null,
  completed_at timestamptz not null,
  duration_seconds integer null
    check (duration_seconds is null or duration_seconds >= 0),
  session_payload jsonb not null default '{}'::jsonb,
  completion_summary jsonb not null default '{}'::jsonb,
  source text not null default 'athlete_app'
    check (char_length(trim(source)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_workout_sessions_athlete_session_unique
    unique (athlete_id, session_id)
);

-- Rerun safety: CREATE TABLE IF NOT EXISTS is not enough — verify essential shape.
do $$
declare
  v_missing_columns text;
begin
  if to_regclass('public.athlete_workout_sessions') is null then
    raise exception 'athlete_workout_sessions missing after create';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing_columns
  from (
    select unnest(array[
      'id',
      'athlete_id',
      'session_id',
      'assignment_id',
      'workout_name',
      'workout_key',
      'started_at',
      'completed_at',
      'duration_seconds',
      'session_payload',
      'completion_summary',
      'source',
      'created_at',
      'updated_at'
    ]) as column_name
  ) as required
  left join information_schema.columns as c
    on c.table_schema = 'public'
   and c.table_name = 'athlete_workout_sessions'
   and c.column_name = required.column_name
  where c.column_name is null;

  if v_missing_columns is not null then
    raise exception
      'Incompatible athlete_workout_sessions draft: missing columns: %',
      v_missing_columns;
  end if;

  if not exists (
    select 1
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'athlete_workout_sessions'
      and con.conname = 'athlete_workout_sessions_athlete_session_unique'
  ) then
    raise exception
      'Incompatible athlete_workout_sessions draft: missing unique constraint athlete_workout_sessions_athlete_session_unique';
  end if;
end $$;

create index if not exists athlete_workout_sessions_athlete_completed_idx
  on public.athlete_workout_sessions (athlete_id, completed_at desc);

create index if not exists athlete_workout_sessions_assignment_idx
  on public.athlete_workout_sessions (assignment_id)
  where assignment_id is not null;

alter table public.athlete_workout_sessions enable row level security;

revoke all on table public.athlete_workout_sessions from public, anon, authenticated;
grant select, insert, update on table public.athlete_workout_sessions to authenticated;
-- Explicit: no DELETE grant for authenticated (or any role above).

drop policy if exists athlete_workout_sessions_owner on public.athlete_workout_sessions;
drop policy if exists athlete_workout_sessions_owner_select on public.athlete_workout_sessions;
drop policy if exists athlete_workout_sessions_owner_insert on public.athlete_workout_sessions;
drop policy if exists athlete_workout_sessions_owner_update on public.athlete_workout_sessions;
drop policy if exists athlete_workout_sessions_coach_read on public.athlete_workout_sessions;

create policy athlete_workout_sessions_owner_select on public.athlete_workout_sessions
for select to authenticated
using (athlete_id = auth.uid());

create policy athlete_workout_sessions_owner_insert on public.athlete_workout_sessions
for insert to authenticated
with check (athlete_id = auth.uid());

create policy athlete_workout_sessions_owner_update on public.athlete_workout_sessions
for update to authenticated
using (athlete_id = auth.uid())
with check (athlete_id = auth.uid());

create policy athlete_workout_sessions_coach_read on public.athlete_workout_sessions
for select to authenticated
using (
  exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = athlete_workout_sessions.athlete_id
  )
);

-- Protect durable system metadata on UPDATE (RLS alone cannot freeze columns)
create or replace function public.protect_athlete_workout_session_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.athlete_id is distinct from old.athlete_id
     or new.session_id is distinct from old.session_id
     or new.created_at is distinct from old.created_at
     or new.source is distinct from old.source
     or new.assignment_id is distinct from old.assignment_id then
    raise exception 'athlete_workout_session_identity_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists athlete_workout_sessions_protect_identity
  on public.athlete_workout_sessions;
create trigger athlete_workout_sessions_protect_identity
before update on public.athlete_workout_sessions
for each row
execute function public.protect_athlete_workout_session_identity();

-- Backfill from legacy foundry_state.history (append-only, skip malformed)
-- Rerun-safe: ON CONFLICT DO NOTHING
-- Optional fields must not cause otherwise-valid workouts to be skipped.
do $$
declare
  v_row record;
  v_entry jsonb;
  v_session_id text;
  v_completed_at timestamptz;
  v_started_at timestamptz;
  v_name text;
  v_sets_count integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  for v_row in
    select user_id, state
    from public.foundry_state
    where jsonb_typeof(state -> 'history') = 'array'
  loop
    for v_entry in
      select value
      from jsonb_array_elements(v_row.state -> 'history')
    loop
      begin
        if jsonb_typeof(v_entry) <> 'object' then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        v_session_id := nullif(trim(coalesce(v_entry ->> 'id', '')), '');
        if v_session_id is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        begin
          v_completed_at := nullif(v_entry ->> 'finishedAt', '')::timestamptz;
        exception when others then
          v_completed_at := null;
        end;

        if v_completed_at is null then
          begin
            v_completed_at := nullif(v_entry ->> 'date', '')::timestamptz;
          exception when others then
            v_completed_at := null;
          end;
        end if;

        if v_completed_at is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        begin
          v_started_at := nullif(v_entry ->> 'startedAt', '')::timestamptz;
        exception when others then
          v_started_at := null;
        end;

        v_name := coalesce(nullif(trim(v_entry ->> 'name'), ''), 'Workout');

        v_sets_count := case
          when jsonb_typeof(v_entry -> 'sets') = 'array'
            then jsonb_array_length(v_entry -> 'sets')
          else 0
        end;

        begin
          insert into public.athlete_workout_sessions (
            athlete_id,
            session_id,
            assignment_id,
            workout_name,
            workout_key,
            started_at,
            completed_at,
            duration_seconds,
            session_payload,
            completion_summary,
            source
          )
          values (
            v_row.user_id,
            v_session_id,
            case
              when coalesce(nullif(trim(v_entry ->> 'assignmentId'), ''), '') ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (v_entry ->> 'assignmentId')::uuid
              else null
            end,
            left(v_name, 200),
            left(coalesce(nullif(trim(v_entry ->> 'workoutKey'), ''), v_name, v_session_id), 200),
            v_started_at,
            v_completed_at,
            case
              when v_started_at is not null and v_completed_at >= v_started_at
                then greatest(1, round(extract(epoch from (v_completed_at - v_started_at)))::integer)
              else null
            end,
            v_entry,
            jsonb_build_object(
              'sets', v_sets_count,
              'backfill', true
            ),
            'foundry_state_backfill'
          )
          on conflict (athlete_id, session_id) do nothing;

          if found then
            v_inserted := v_inserted + 1;
          end if;
        exception when others then
          v_skipped := v_skipped + 1;
        end;
      end;
    end loop;
  end loop;

  raise notice 'AVAREN 9.1 backfill complete. inserted=% skipped=%', v_inserted, v_skipped;
end $$;

commit;
