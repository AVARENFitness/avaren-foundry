-- AVAREN Sprint 9.1 — Durable Workout History precheck (read-only)
-- Run BEFORE AVAREN_DURABLE_WORKOUT_HISTORY_9_1_MIGRATION.sql
-- STOP if any blocking metric > 0

-- ── Dependency gate ───────────────────────────────────────────────────────────

select 'foundryStateExists' as metric,
       case when to_regclass('public.foundry_state') is not null then 0 else 1 end::bigint as value;

select 'coachClientsExists' as metric,
       case when to_regclass('public.coach_clients') is not null then 0 else 1 end::bigint as value;

-- ── Existing durable table compatibility ──────────────────────────────────────

select 'athleteWorkoutSessionsExists' as metric,
       case when to_regclass('public.athlete_workout_sessions') is not null then 1 else 0 end::bigint as value;

select 'athleteWorkoutSessionsMissingRequiredColumns' as metric,
       coalesce((
         select count(*)::bigint
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
         ) as expected
         left join information_schema.columns as c
           on c.table_schema = 'public'
          and c.table_name = 'athlete_workout_sessions'
          and c.column_name = expected.column_name
         where c.column_name is null
       ), 0) as value
where to_regclass('public.athlete_workout_sessions') is not null;

select 'athleteWorkoutSessionsUniqueMissing' as metric,
       case
         when to_regclass('public.athlete_workout_sessions') is null then 0
         when exists (
           select 1
           from pg_constraint as con
           join pg_class as rel on rel.oid = con.conrelid
           join pg_namespace as nsp on nsp.oid = rel.relnamespace
           where nsp.nspname = 'public'
             and rel.relname = 'athlete_workout_sessions'
             and con.conname = 'athlete_workout_sessions_athlete_session_unique'
         ) then 0
         else 1
       end::bigint as value;

-- Blocking if an incompatible prior draft is already present (migration will abort).
select 'athleteWorkoutSessionsIncompatibleDraft' as metric,
       case
         when to_regclass('public.athlete_workout_sessions') is null then 0
         when (
           select count(*)::bigint
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
           ) as expected
           left join information_schema.columns as c
             on c.table_schema = 'public'
            and c.table_name = 'athlete_workout_sessions'
            and c.column_name = expected.column_name
           where c.column_name is null
         ) > 0 then 1
         when not exists (
           select 1
           from pg_constraint as con
           join pg_class as rel on rel.oid = con.conrelid
           join pg_namespace as nsp on nsp.oid = rel.relnamespace
           where nsp.nspname = 'public'
             and rel.relname = 'athlete_workout_sessions'
             and con.conname = 'athlete_workout_sessions_athlete_session_unique'
         ) then 1
         else 0
       end::bigint as value;

select 'athleteWorkoutSessionsRlsDisabled' as metric,
       case
         when to_regclass('public.athlete_workout_sessions') is null then 0
         when coalesce((
           select c.relrowsecurity
           from pg_class as c
           join pg_namespace as n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname = 'athlete_workout_sessions'
         ), false) then 0
         else 1
       end::bigint as value;

select 'foundryStateRevisionColumnExists' as metric,
       case
         when exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'foundry_state'
             and column_name = 'state_revision'
         ) then 1 else 0
       end::bigint as value;

-- ── Privilege smell if table already exists (must be 0) ───────────────────────

select 'athleteWorkoutSessionsAnonOrPublicGrants' as metric,
       coalesce((
         select count(*)::bigint
         from information_schema.role_table_grants as g
         where g.table_schema = 'public'
           and g.table_name = 'athlete_workout_sessions'
           and g.grantee in ('anon', 'public')
       ), 0) as value
where to_regclass('public.athlete_workout_sessions') is not null;

select 'athleteWorkoutSessionsAuthenticatedDeleteGrant' as metric,
       coalesce((
         select count(*)::bigint
         from information_schema.role_table_grants as g
         where g.table_schema = 'public'
           and g.table_name = 'athlete_workout_sessions'
           and g.grantee = 'authenticated'
           and g.privilege_type = 'DELETE'
       ), 0) as value
where to_regclass('public.athlete_workout_sessions') is not null;

-- ── Legacy history inventory ──────────────────────────────────────────────────

select 'foundryStatesWithHistory' as metric,
       coalesce((
         select count(*)::bigint
         from public.foundry_state
         where jsonb_typeof(state -> 'history') = 'array'
           and jsonb_array_length(state -> 'history') > 0
       ), 0) as value
where to_regclass('public.foundry_state') is not null;

select 'legacyHistoryEntryEstimate' as metric,
       coalesce((
         select sum(jsonb_array_length(state -> 'history'))::bigint
         from public.foundry_state
         where jsonb_typeof(state -> 'history') = 'array'
       ), 0) as value
where to_regclass('public.foundry_state') is not null;

select 'legacyHistoryMissingIds' as metric,
       coalesce((
         select count(*)::bigint
         from public.foundry_state as fs
         cross join lateral jsonb_array_elements(fs.state -> 'history') as entry(value)
         where jsonb_typeof(fs.state -> 'history') = 'array'
           and (
             jsonb_typeof(entry.value) <> 'object'
             or nullif(trim(coalesce(entry.value ->> 'id', '')), '') is null
           )
       ), 0) as value
where to_regclass('public.foundry_state') is not null;

select 'legacyHistoryMissingUsableCompletedAt' as metric,
       coalesce((
         select count(*)::bigint
         from public.foundry_state as fs
         cross join lateral jsonb_array_elements(fs.state -> 'history') as entry(value)
         where jsonb_typeof(fs.state -> 'history') = 'array'
           and jsonb_typeof(entry.value) = 'object'
           and nullif(trim(coalesce(entry.value ->> 'id', '')), '') is not null
           and nullif(entry.value ->> 'finishedAt', '') is null
           and nullif(entry.value ->> 'date', '') is null
       ), 0) as value
where to_regclass('public.foundry_state') is not null;

select 'legacyHistoryDuplicateSessionIdentities' as metric,
       coalesce((
         select count(*)::bigint
         from (
           select
             fs.user_id,
             nullif(trim(coalesce(entry.value ->> 'id', '')), '') as session_id,
             count(*) as c
           from public.foundry_state as fs
           cross join lateral jsonb_array_elements(fs.state -> 'history') as entry(value)
           where jsonb_typeof(fs.state -> 'history') = 'array'
             and jsonb_typeof(entry.value) = 'object'
             and nullif(trim(coalesce(entry.value ->> 'id', '')), '') is not null
           group by fs.user_id, nullif(trim(coalesce(entry.value ->> 'id', '')), '')
           having count(*) > 1
         ) as dup
       ), 0) as value
where to_regclass('public.foundry_state') is not null;
