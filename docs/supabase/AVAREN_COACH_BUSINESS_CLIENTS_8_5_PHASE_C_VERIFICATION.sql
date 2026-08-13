-- AVAREN Sprint 8.5.2 — Phase C verification (read-only)
-- Run AFTER AVAREN_COACH_BUSINESS_CLIENTS_8_5_PHASE_C_MIGRATION.sql
-- All blocking integrity metrics must be 0.

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

-- ── Must be 0 ─────────────────────────────────────────────────────────────────

select 'appointmentsWithoutBusinessClient' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.business_client_id is null;

select 'connectedAppointmentIdentityMismatches' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc on bc.id = s.business_client_id
where s.athlete_id is not null
  and bc.linked_user_id is not null
  and s.athlete_id is distinct from bc.linked_user_id;

select 'offlineAppointmentsWithAthleteId' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc on bc.id = s.business_client_id
where bc.linked_user_id is null
  and s.athlete_id is not null;

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
    or (bc.linked_user_id is not null and cc.athlete_id is distinct from bc.linked_user_id)
  );

-- ── Bridge lifecycle (8.5.2) — must be 0 ─────────────────────────────────────

select 'archivedClientsWithActiveBridge' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
join public.coach_clients as cc
  on cc.business_client_id = bc.id
  and cc.coach_id = bc.coach_id
where bc.status = 'archived';

select 'activeLinkedClientsMissingBridge' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
left join public.coach_clients as cc
  on cc.business_client_id = bc.id
  and cc.coach_id = bc.coach_id
  and cc.athlete_id = bc.linked_user_id
where bc.status = 'active'
  and bc.linked_user_id is not null
  and cc.id is null;

select 'activeUnlinkedClientsWithBridge' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
join public.coach_clients as cc
  on cc.business_client_id = bc.id
  and cc.coach_id = bc.coach_id
where bc.status = 'active'
  and bc.linked_user_id is null;

-- ── Informational (not blocking) ──────────────────────────────────────────────

select 'historicalCompletedMissingAthleteId' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc on bc.id = s.business_client_id
where bc.linked_user_id is not null
  and s.status in ('completed', 'cancelled', 'missed')
  and s.athlete_id is null;
