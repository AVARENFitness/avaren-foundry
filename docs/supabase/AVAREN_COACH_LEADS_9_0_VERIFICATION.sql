-- AVAREN Sprint 9.0.1 — Coach Leads verification (read-only)
-- Run AFTER AVAREN_COACH_LEADS_9_0_MIGRATION.sql
-- Blocking metrics must be 0.

-- ── Table + RLS ───────────────────────────────────────────────────────────────

select 'coachLeadsTableExists' as check,
       case when to_regclass('public.coach_leads') is not null then 'OK' else 'FAIL' end as status;

select 'coachLeadsRlsEnabled' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when coalesce((
           select c.relrowsecurity
           from pg_class as c
           join pg_namespace as n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname = 'coach_leads'
         ), false) then 'OK'
         else 'FAIL'
       end as status;

-- ── Privilege matrix ──────────────────────────────────────────────────────────

select 'coachLeadsAnonDenied' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when coalesce((
           select count(*)
           from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'coach_leads'
             and g.grantee in ('anon', 'public')
         ), 0) = 0 then 'OK'
         else 'FAIL'
       end as status;

select 'coachLeadsAuthenticatedSelectGrant' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when exists (
           select 1
           from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'coach_leads'
             and g.grantee = 'authenticated'
             and g.privilege_type = 'SELECT'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'coachLeadsAuthenticatedDeleteDenied' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when not exists (
           select 1
           from information_schema.role_table_grants as g
           where g.table_schema = 'public'
             and g.table_name = 'coach_leads'
             and g.grantee = 'authenticated'
             and g.privilege_type = 'DELETE'
         ) then 'OK'
         else 'FAIL'
       end as status;

-- ── Policies ──────────────────────────────────────────────────────────────────

select 'coachLeadsSelectPolicyExists' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'coach_leads'
             and policyname = 'coach_leads_select'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'coachLeadsInsertPolicyExists' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'coach_leads'
             and policyname = 'coach_leads_insert'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'coachLeadsUpdatePolicyExists' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = 'coach_leads'
             and policyname = 'coach_leads_update'
         ) then 'OK'
         else 'FAIL'
       end as status;

-- ── Conversion RPC ──────────────────────────────────────────────────────────────

select 'convertCoachLeadRpcExists' as check,
       case
         when to_regprocedure('public.convert_coach_lead_to_business_client(uuid)') is not null
         then 'OK'
         else 'FAIL'
       end as status;

select 'convertCoachLeadRpcAuthenticatedExecute' as check,
       case
         when to_regprocedure('public.convert_coach_lead_to_business_client(uuid)') is null then 'SKIP'
         when has_function_privilege(
           'authenticated',
           'public.convert_coach_lead_to_business_client(uuid)',
           'EXECUTE'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'convertCoachLeadRpcAnonDenied' as check,
       case
         when to_regprocedure('public.convert_coach_lead_to_business_client(uuid)') is null then 'SKIP'
         when has_function_privilege(
           'anon',
           'public.convert_coach_lead_to_business_client(uuid)',
           'EXECUTE'
         ) then 'FAIL'
         else 'OK'
       end as status;

-- ── Column semantics ───────────────────────────────────────────────────────────

select 'nextFollowUpAtIsTimestamptz' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when exists (
           select 1
           from information_schema.columns as c
           where c.table_schema = 'public'
             and c.table_name = 'coach_leads'
             and c.column_name = 'next_follow_up_at'
             and c.udt_name = 'timestamptz'
         ) then 'OK'
         else 'FAIL'
       end as status;

select 'stageConstraintPresent' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when exists (
           select 1
           from pg_constraint as con
           join pg_class as rel on rel.oid = con.conrelid
           join pg_namespace as nsp on nsp.oid = rel.relnamespace
           where nsp.nspname = 'public'
             and rel.relname = 'coach_leads'
             and con.contype = 'c'
             and pg_get_constraintdef(con.oid) ilike '%stage%'
         ) then 'OK'
         else 'FAIL'
       end as status;

-- ── Integrity (must be 0) ─────────────────────────────────────────────────────

select 'coachLeadsOrphanBusinessClientLinks' as metric,
       coalesce((
         select count(*)::bigint
         from public.coach_leads as l
         left join public.coach_business_clients as bc
           on bc.id = l.business_client_id
          and bc.coach_id = l.coach_id
         where l.business_client_id is not null
           and bc.id is null
       ), 0) as value
where to_regclass('public.coach_leads') is not null;

select 'coachLeadsDuplicateBusinessClientLinks' as metric,
       coalesce((
         select count(*)::bigint
         from (
           select business_client_id, count(*) as c
           from public.coach_leads
           where business_client_id is not null
           group by business_client_id
           having count(*) > 1
         ) as dup
       ), 0) as value
where to_regclass('public.coach_leads') is not null;

select 'coachLeadsCoachIdNull' as metric,
       coalesce((
         select count(*)::bigint
         from public.coach_leads
         where coach_id is null
       ), 0) as value
where to_regclass('public.coach_leads') is not null;

-- ── Indexes (informational) ───────────────────────────────────────────────────

select 'coachLeadsCoachIdIndexExists' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when to_regclass('public.coach_leads_coach_id_idx') is not null then 'OK'
         else 'FAIL'
       end as status;

select 'coachLeadsFollowUpIndexExists' as check,
       case
         when to_regclass('public.coach_leads') is null then 'SKIP'
         when to_regclass('public.coach_leads_follow_up_idx') is not null then 'OK'
         else 'FAIL'
       end as status;
