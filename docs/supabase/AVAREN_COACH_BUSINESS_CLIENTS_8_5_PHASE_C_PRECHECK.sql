-- AVAREN Sprint 8.5 — Phase C precheck (read-only)
-- Run BEFORE AVAREN_COACH_BUSINESS_CLIENTS_8_5_PHASE_C_MIGRATION.sql
-- STOP if any blocking metric > 0

-- ── Phase B gate (must be green) ─────────────────────────────────────────────

select 'appointmentsMissingBusinessClient' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.business_client_id is null
  and s.athlete_id is not null;

select 'connectedAppointmentIdentityMismatches' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc on bc.id = s.business_client_id
where s.athlete_id is not null
  and bc.linked_user_id is not null
  and s.athlete_id is distinct from bc.linked_user_id;

select 'duplicateBusinessClientLinks' as metric,
       count(*)::bigint as value
from (
  select coach_id, linked_user_id, count(*) as c
  from public.coach_business_clients
  where linked_user_id is not null
  group by coach_id, linked_user_id
  having count(*) > 1
) as dup;

select 'orphanCoachClientBridges' as metric,
       count(*)::bigint as value
from public.coach_clients as cc
left join public.coach_business_clients as bc on bc.id = cc.business_client_id
where cc.business_client_id is not null
  and (
    bc.id is null
    or cc.coach_id is distinct from bc.coach_id
    or cc.athlete_id is distinct from bc.linked_user_id
  );

-- ── Offline readiness (informational pre-migration) ─────────────────────────

select 'offlineClientsCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.linked_user_id is null
  and bc.status = 'active';

select 'connectedClientsCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.linked_user_id is not null
  and bc.status = 'active';

select 'archivedClientsCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'archived';
