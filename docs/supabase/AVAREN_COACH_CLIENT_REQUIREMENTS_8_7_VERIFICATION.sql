-- AVAREN 8.7.2 — Coaching requirements verification (read-only)
-- Run AFTER AVAREN_COACH_CLIENT_REQUIREMENTS_8_7_MIGRATION.sql
-- Blocking integrity metrics must be 0.

-- ── Schema installation (expected = 1) ────────────────────────────────────────

select 'coachingRequirementsColumnInstalled' as metric,
       count(*)::bigint as value
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_business_clients'
  and column_name = 'coaching_requirements';

select 'coachingRequirementsConstraintInstalled' as metric,
       count(*)::bigint as value
from pg_catalog.pg_constraint as con
join pg_catalog.pg_class as rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace as nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'coach_business_clients'
  and con.conname = 'coach_business_clients_coaching_requirements_check';

-- ── Must be 0 ─────────────────────────────────────────────────────────────────

select 'invalidWeeklyCheckInValues' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where not (
  bc.coaching_requirements ? 'weekly_check_in'
  and bc.coaching_requirements->>'weekly_check_in' in ('required', 'not_required')
);

select 'duplicateActiveLinkedRelationships' as metric,
       count(*)::bigint as value
from (
  select cc.athlete_id, count(distinct bc.id) as relationship_count
  from public.coach_business_clients as bc
  join public.coach_clients as cc
    on cc.business_client_id = bc.id
   and cc.coach_id = bc.coach_id
   and cc.athlete_id = bc.linked_user_id
  where bc.status = 'active'
    and bc.linked_user_id is not null
  group by cc.athlete_id
  having count(distinct bc.id) > 1
) as dup;

select 'offlineClientsCreatingCheckInObligation' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'active'
  and bc.linked_user_id is null
  and bc.coaching_requirements->>'weekly_check_in' = 'required'
  and exists (
    select 1
    from public.coach_clients as cc
    where cc.business_client_id = bc.id
      and cc.coach_id = bc.coach_id
  );

select 'archivedClientsCreatingCheckInObligation' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
join public.coach_clients as cc
  on cc.business_client_id = bc.id
 and cc.coach_id = bc.coach_id
 and cc.athlete_id = bc.linked_user_id
where bc.status = 'archived'
  and bc.coaching_requirements->>'weekly_check_in' = 'required';

-- ── Informational counts (may be > 0) ───────────────────────────────────────

select 'activeConnectedRequiredCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'active'
  and bc.linked_user_id is not null
  and bc.coaching_requirements->>'weekly_check_in' = 'required';

select 'activeConnectedNotRequiredCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'active'
  and bc.linked_user_id is not null
  and bc.coaching_requirements->>'weekly_check_in' = 'not_required';

select 'activeOfflineStoredRequiredCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'active'
  and bc.linked_user_id is null
  and bc.coaching_requirements->>'weekly_check_in' = 'required';

-- ── RPC presence ──────────────────────────────────────────────────────────────

select 'updateCoachingRequirementsRpcInstalled' as metric,
       count(*)::bigint as value
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_business_client_coaching_requirements';

select 'getAthleteCoachingRequirementsRpcInstalled' as metric,
       count(*)::bigint as value
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_athlete_coaching_requirements';
