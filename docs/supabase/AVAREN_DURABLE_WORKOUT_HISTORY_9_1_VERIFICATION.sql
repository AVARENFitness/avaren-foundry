-- AVAREN Sprint 9.1 — Durable Workout History verification (read-only)
-- Run AFTER AVAREN_DURABLE_WORKOUT_HISTORY_9_1_MIGRATION.sql

select 'athleteWorkoutSessionsExists' as check,
       case when to_regclass('public.athlete_workout_sessions') is not null then 'OK' else 'FAIL' end as status;

select 'athleteWorkoutSessionsRlsEnabled' as check,
       case
         when to_regclass('public.athlete_workout_sessions') is null then 'SKIP'
         when coalesce((
           select c.relrowsecurity
           from pg_class as c
           join pg_namespace as n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname = 'athlete_workout_sessions'
         ), false) then 'OK'
         else 'FAIL'
       end as status;

select 'athleteSessionUniqueConstraint' as check,
       case
         when to_regclass('public.athlete_workout_sessions') is null then 'SKIP'
         when exists (
           select 1
           from pg_constraint as con
           join pg_class as rel on rel.oid = con.conrelid
           join pg_namespace as nsp on nsp.oid = rel.relnamespace
           where nsp.nspname = 'public'
             and rel.relname = 'athlete_workout_sessions'
             and con.conname = 'athlete_workout_sessions_athlete_session_unique'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'foundryStateRevisionColumn' as check,
       case
         when exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'foundry_state'
             and column_name = 'state_revision'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'athleteWorkoutSessionsAnonDenied' as check,
       case
         when to_regclass('public.athlete_workout_sessions') is null then 'SKIP'
         when coalesce((
           select count(*)
           from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'athlete_workout_sessions'
             and g.grantee in ('anon', 'public')
         ), 0) = 0 then 'OK'
         else 'FAIL'
       end as status;

select 'ownerSelectGrant' as check,
       case
         when exists (
           select 1 from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'athlete_workout_sessions'
             and g.grantee = 'authenticated'
             and g.privilege_type = 'SELECT'
         ) then 'OK' else 'FAIL'
       end as status;

select 'ownerInsertGrant' as check,
       case
         when exists (
           select 1 from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'athlete_workout_sessions'
             and g.grantee = 'authenticated'
             and g.privilege_type = 'INSERT'
         ) then 'OK' else 'FAIL'
       end as status;

select 'ownerUpdateGrant' as check,
       case
         when exists (
           select 1 from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'athlete_workout_sessions'
             and g.grantee = 'authenticated'
             and g.privilege_type = 'UPDATE'
         ) then 'OK' else 'FAIL'
       end as status;

select 'ownerDeleteGrantDenied' as check,
       case
         when not exists (
           select 1 from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'athlete_workout_sessions'
             and g.grantee = 'authenticated'
             and g.privilege_type = 'DELETE'
         ) then 'OK' else 'FAIL'
       end as status;

select 'ownerSelectPolicy' as check,
       case
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'athlete_workout_sessions'
             and policyname = 'athlete_workout_sessions_owner_select'
         ) then 'OK' else 'FAIL'
       end as status;

select 'ownerInsertPolicy' as check,
       case
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'athlete_workout_sessions'
             and policyname = 'athlete_workout_sessions_owner_insert'
         ) then 'OK' else 'FAIL'
       end as status;

select 'ownerUpdatePolicy' as check,
       case
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'athlete_workout_sessions'
             and policyname = 'athlete_workout_sessions_owner_update'
         ) then 'OK' else 'FAIL'
       end as status;

select 'noOwnerForAllPolicy' as check,
       case
         when not exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'athlete_workout_sessions'
             and policyname = 'athlete_workout_sessions_owner'
         ) then 'OK' else 'FAIL'
       end as status;

select 'coachSelectPolicyOnly' as check,
       case
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'athlete_workout_sessions'
             and policyname = 'athlete_workout_sessions_coach_read'
             and cmd = 'SELECT'
         )
         and not exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'athlete_workout_sessions'
             and policyname like 'athlete_workout_sessions_coach%'
             and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
         ) then 'OK' else 'FAIL'
       end as status;

select 'immutableIdentityTrigger' as check,
       case
         when to_regprocedure('public.protect_athlete_workout_session_identity()') is not null
          and exists (
            select 1
            from pg_trigger as t
            join pg_class as c on c.oid = t.tgrelid
            join pg_namespace as n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'athlete_workout_sessions'
              and t.tgname = 'athlete_workout_sessions_protect_identity'
              and not t.tgisinternal
          )
          and pg_get_functiondef('public.protect_athlete_workout_session_identity()'::regprocedure)
              ilike '%source%'
          and pg_get_functiondef('public.protect_athlete_workout_session_identity()'::regprocedure)
              ilike '%assignment_id%'
          then 'OK'
         else 'FAIL'
       end as status;

-- Integrity (must be 0)
select 'duplicateAthleteSessionIds' as metric,
       coalesce((
         select count(*)::bigint
         from (
           select athlete_id, session_id, count(*) as c
           from public.athlete_workout_sessions
           group by athlete_id, session_id
           having count(*) > 1
         ) as dup
       ), 0) as value
where to_regclass('public.athlete_workout_sessions') is not null;

select 'sessionsMissingPayloadObject' as metric,
       coalesce((
         select count(*)::bigint
         from public.athlete_workout_sessions
         where jsonb_typeof(session_payload) <> 'object'
       ), 0) as value
where to_regclass('public.athlete_workout_sessions') is not null;

-- Informational
select 'durableSessionCount' as metric,
       coalesce((select count(*)::bigint from public.athlete_workout_sessions), 0) as value
where to_regclass('public.athlete_workout_sessions') is not null;

select 'legacyHistoryStillPresent' as metric,
       coalesce((
         select count(*)::bigint
         from public.foundry_state
         where jsonb_typeof(state -> 'history') = 'array'
           and jsonb_array_length(state -> 'history') > 0
       ), 0) as value
where to_regclass('public.foundry_state') is not null;
