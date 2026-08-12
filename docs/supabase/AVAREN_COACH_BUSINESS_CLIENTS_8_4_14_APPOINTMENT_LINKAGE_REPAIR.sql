-- AVAREN Sprint 8.4.14 — Connected appointment business_client_id repair
-- DO NOT RUN AUTOMATICALLY. Review precheck counts before executing writes.
--
-- Scope: appointments with athlete_id present and business_client_id NULL.
-- Rule: repair only when exactly ONE coach_business_clients row matches:
--   coach_id = session.coach_id AND linked_user_id = session.athlete_id
--
-- Does NOT guess by email/name. Does NOT weaken pass or ledger integrity.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. PRECHECK — STOP if ambiguousAppointments > 0 or unresolvableAppointments > 0
-- ══════════════════════════════════════════════════════════════════════════════

select 'repairableAppointments' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.business_client_id is null
  and s.athlete_id is not null
  and exists (
    select 1
    from public.coach_business_clients as bc
    where bc.coach_id = s.coach_id
      and bc.linked_user_id = s.athlete_id
  )
  and (
    select count(*)
    from public.coach_business_clients as bc
    where bc.coach_id = s.coach_id
      and bc.linked_user_id = s.athlete_id
  ) = 1;

select 'ambiguousAppointments' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.business_client_id is null
  and s.athlete_id is not null
  and (
    select count(*)
    from public.coach_business_clients as bc
    where bc.coach_id = s.coach_id
      and bc.linked_user_id = s.athlete_id
  ) > 1;

select 'unresolvableAppointments' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
where s.business_client_id is null
  and s.athlete_id is not null
  and not exists (
    select 1
    from public.coach_business_clients as bc
    where bc.coach_id = s.coach_id
      and bc.linked_user_id = s.athlete_id
  );

-- Detail: rows that would be repaired
select
  s.id,
  s.coach_id,
  s.athlete_id,
  s.status,
  s.session_date,
  s.created_at,
  bc.id as resolved_business_client_id
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc
  on bc.coach_id = s.coach_id
 and bc.linked_user_id = s.athlete_id
where s.business_client_id is null
  and s.athlete_id is not null
  and (
    select count(*)
    from public.coach_business_clients as bc2
    where bc2.coach_id = s.coach_id
      and bc2.linked_user_id = s.athlete_id
  ) = 1
order by s.created_at desc;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. REPAIR — execute only when ambiguous = 0 and unresolvable = 0
-- ══════════════════════════════════════════════════════════════════════════════

-- begin;

-- update public.coach_scheduled_sessions as s
-- set business_client_id = bc.id
-- from public.coach_business_clients as bc
-- where s.business_client_id is null
--   and s.athlete_id is not null
--   and bc.coach_id = s.coach_id
--   and bc.linked_user_id = s.athlete_id
--   and (
--     select count(*)
--     from public.coach_business_clients as bc2
--     where bc2.coach_id = s.coach_id
--       and bc2.linked_user_id = s.athlete_id
--   ) = 1;

-- commit;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. VERIFICATION — must all be 0 after repair
-- ══════════════════════════════════════════════════════════════════════════════

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

-- Identity alignment after repair
select 'appointmentIdentityMismatches' as metric,
       count(*)::bigint as value
from public.coach_scheduled_sessions as s
join public.coach_business_clients as bc on bc.id = s.business_client_id
where s.athlete_id is not null
  and bc.linked_user_id is not null
  and s.athlete_id is distinct from bc.linked_user_id;
