-- AVAREN Sprint 8.4.4 — Backfill verification (read-only)
-- Run AFTER 8_4_1B_BACKFILL. All mismatch counts must be 0 before 8_4_1D.
-- DO NOT RUN AUTOMATICALLY alongside writes unless intentional.

-- ── Counts ────────────────────────────────────────────────────────────────────

select 'coachClientsCount' as metric,
       count(*)::bigint as value
from public.coach_clients;

select 'businessClientsCount' as metric,
       count(*)::bigint as value
from public.coach_business_clients;

select 'linkedBridgeCount' as metric,
       count(*)::bigint as value
from public.coach_clients
where business_client_id is not null;

select 'appointmentsCount' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions;

select 'appointmentsWithBusinessClient' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions
where business_client_id is not null;

-- ── Must be 0 (Phase C gate) ──────────────────────────────────────────────────

select 'orphanBusinessClients' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.linked_user_id is not null
  and not exists (
    select 1 from public.coach_clients as cc
    where cc.coach_id = bc.coach_id
      and cc.athlete_id = bc.linked_user_id
  );

select 'duplicateCoachLinkedUsers' as metric,
       count(*)::bigint as value
from (
  select coach_id, linked_user_id, count(*) as c
  from public.coach_business_clients
  where linked_user_id is not null
  group by coach_id, linked_user_id
  having count(*) > 1
) as dup;

select 'appointmentIdentityMismatches' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc on bc.id = s.business_client_id
where s.athlete_id is not null
  and bc.linked_user_id is not null
  and s.athlete_id is distinct from bc.linked_user_id;

select 'appointmentsMissingBusinessClient' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.business_client_id is null
  and s.athlete_id is not null;

select 'completedAppointmentsMissingBusinessClient' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.status = 'completed'
  and s.business_client_id is null;

select 'bridgeCoachMismatches' as metric,
       count(*)::bigint as value
from public.coach_clients as cc
join public.coach_business_clients as bc on bc.id = cc.business_client_id
where cc.coach_id is distinct from bc.coach_id
   or cc.athlete_id is distinct from bc.linked_user_id;

select 'passClientMismatches' as metric,
       count(*)::bigint as value
from public.coach_client_passes as p
join public.coach_business_clients as bc on bc.id = p.business_client_id
where p.coach_id is distinct from bc.coach_id;

select 'ledgerPassClientMismatches' as metric,
       count(*)::bigint as value
from public.coach_client_pass_ledger as l
join public.coach_client_passes as p on p.id = l.pass_id
where l.coach_id is distinct from p.coach_id
   or l.business_client_id is distinct from p.business_client_id;

select 'duplicateAppointmentUsageDebits' as metric,
       count(*)::bigint as value
from (
  select scheduled_session_id, count(*) as c
  from public.coach_client_pass_ledger
  where scheduled_session_id is not null
    and entry_type in ('session_used', 'no_show_charged')
  group by scheduled_session_id
  having count(*) > 1
) as dup;

select 'negativeUnexplainedPassBalances' as metric,
       count(*)::bigint as value
from public.coach_client_pass_balances as b
where b.balance < 0;

-- Legacy package counter inconsistencies (should be 0 before backfill ran)
select 'legacyPackageCounterInconsistencies' as metric,
       count(*)::bigint as value
from public.coach_session_packages as pkg
where pkg.total_sessions <> (pkg.sessions_used + pkg.sessions_remaining);

-- Migrated pass balance vs legacy remaining (should be 0 after backfill)
select 'migratedPassBalanceMismatches' as metric,
       count(*)::bigint as value
from public.coach_client_passes as p
join public.coach_session_packages as pkg on pkg.id = p.id
left join public.coach_client_pass_balances as b on b.pass_id = p.id
where coalesce(b.balance, 0) <> pkg.sessions_remaining;

-- Clients with multiple active passes (informational — not a blocker)
select 'clientsWithMultipleActivePasses' as metric,
       count(*)::bigint as value
from (
  select business_client_id, count(*) as c
  from public.coach_client_passes
  where status = 'active'
  group by business_client_id
  having count(*) > 1
) as multi;

-- Charge decision / ledger consistency (must be 0 after workflows complete)
select 'missedChargeDecisionWithoutDebit' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.status = 'missed'
  and s.missed_charge_decision = 'charge'
  and not exists (
    select 1
    from public.coach_client_pass_ledger as l
    where l.scheduled_session_id = s.id
      and l.entry_type = 'no_show_charged'
  );

select 'noShowDebitWithoutChargeDecision' as metric,
       count(*)::bigint as value
from public.coach_client_pass_ledger as l
join public.coach_scheduled_sessions as s on s.id = l.scheduled_session_id
where l.entry_type = 'no_show_charged'
  and s.missed_charge_decision is distinct from 'charge';

-- ── Sample mismatches (debug) ─────────────────────────────────────────────────

-- select s.id, s.status, s.athlete_id, s.business_client_id, bc.linked_user_id
-- from public.coach_scheduled_sessions s
-- left join public.coach_business_clients bc on bc.id = s.business_client_id
-- where s.status = 'completed' and s.business_client_id is null
-- limit 20;
