-- AVAREN Sprint 9.0.1 — Coach Leads precheck (read-only)
-- Run BEFORE AVAREN_COACH_LEADS_9_0_MIGRATION.sql
-- STOP if any blocking metric > 0

-- ── Dependency gate ───────────────────────────────────────────────────────────

select 'coachBusinessClientsExists' as metric,
       case when to_regclass('public.coach_business_clients') is not null then 0 else 1 end::bigint as value;

select 'createCoachBusinessClientExists' as metric,
       case
         when to_regprocedure('public.create_coach_business_client(text,text,text,text,text,date,text,text)') is not null
         then 0 else 1
       end::bigint as value;

select 'isAvarenCoachExists' as metric,
       case when to_regprocedure('public.is_avaren_coach()') is not null then 0 else 1 end::bigint as value;

select 'touchUpdatedAtExists' as metric,
       case when to_regprocedure('public.touch_updated_at()') is not null then 0 else 1 end::bigint as value;

-- ── Existing coach_leads state (informational) ────────────────────────────────

select 'coachLeadsTableExists' as metric,
       case when to_regclass('public.coach_leads') is not null then 1 else 0 end::bigint as value;

select 'coachLeadsRowCount' as metric,
       coalesce((select count(*)::bigint from public.coach_leads), 0) as value
where to_regclass('public.coach_leads') is not null;

select 'convertCoachLeadRpcExists' as metric,
       case
         when to_regprocedure('public.convert_coach_lead_to_business_client(uuid)') is not null
         then 1 else 0
       end::bigint as value;

-- ── Conflicting legacy objects (must be 0 before first migration) ─────────────

select 'coachLeadsAnonSelectGrant' as metric,
       coalesce((
         select count(*)::bigint
         from information_schema.role_table_grants as g
         where g.table_schema = 'public'
           and g.table_name = 'coach_leads'
           and g.grantee = 'anon'
           and g.privilege_type = 'SELECT'
       ), 0) as value
where to_regclass('public.coach_leads') is not null;

select 'coachLeadsPublicSelectGrant' as metric,
       coalesce((
         select count(*)::bigint
         from information_schema.role_table_grants as g
         where g.table_schema = 'public'
           and g.table_name = 'coach_leads'
           and g.grantee = 'public'
           and g.privilege_type = 'SELECT'
       ), 0) as value
where to_regclass('public.coach_leads') is not null;

-- ── Expected column presence when table already exists ────────────────────────

select 'coachLeadsMissingExpectedColumns' as metric,
       coalesce((
         select count(*)::bigint
         from (
           select unnest(array[
             'id',
             'coach_id',
             'first_name',
             'last_name',
             'preferred_name',
             'phone',
             'email',
             'goal',
             'source',
             'notes',
             'stage',
             'next_follow_up_at',
             'business_client_id',
             'created_at',
             'updated_at'
           ]) as column_name
         ) as expected
         left join information_schema.columns as c
           on c.table_schema = 'public'
          and c.table_name = 'coach_leads'
          and c.column_name = expected.column_name
         where c.column_name is null
       ), 0) as value
where to_regclass('public.coach_leads') is not null;

-- ── Orphan linkage pre-migration (must be 0 if table exists) ──────────────────

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

-- ── is_avaren_coach meaning (informational) ───────────────────────────────────

select 'coachAllowlistCount' as metric,
       coalesce((select count(*)::bigint from public.coach_allowlist), 0) as value
where to_regclass('public.coach_allowlist') is not null;
