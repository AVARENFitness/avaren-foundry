-- AVAREN 8.10.5 — Harden reminder completion contract (forward fix)
-- DO NOT RUN without explicit approval.
--
-- Problem:
--   complete_appointment_reminder_delivery() previously updated
--   reminder_sent_at / coach_reminder_sent_at for ANY successful delivery
--   based only on recipient_role.
--
-- Fix:
--   Update reminder compatibility markers ONLY for actual 2-hour reminder
--   notification types.

begin;

create or replace function public.complete_appointment_reminder_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.appointment_notification_deliveries;
begin
  select *
  into v_row
  from public.appointment_notification_deliveries as d
  where d.id = p_delivery_id
  for update;

  if not found then
    return false;
  end if;

  if v_row.delivery_status = 'sent' then
    return true;
  end if;

  update public.appointment_notification_deliveries as d
  set
    delivery_status = case when p_success then 'sent' else 'failed' end,
    sent_at = case when p_success then now() else d.sent_at end,
    attempt_count = d.attempt_count + 1,
    last_error = p_error,
    claimed_at = null,
    claim_expires_at = null,
    updated_at = now()
  where d.id = p_delivery_id;

  if p_success then
    if v_row.notification_type = 'appointment-athlete-reminder-2h' then
      update public.coach_scheduled_sessions as s
      set reminder_sent_at = now(),
          updated_at = now()
      where s.id = v_row.appointment_id;
    elsif v_row.notification_type = 'appointment-coach-reminder-2h' then
      update public.coach_scheduled_sessions as s
      set coach_reminder_sent_at = now(),
          updated_at = now()
      where s.id = v_row.appointment_id;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_appointment_reminder_delivery(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_appointment_reminder_delivery(uuid, boolean, text)
  to service_role;

commit;

-- ==================================================
-- VERIFICATION (read-only checks after apply)
-- ==================================================

-- A. Immediate athlete scheduled completion must NOT set reminder_sent_at
--
-- Setup (DEV only — replace UUIDs):
--   1. Insert a test coach_scheduled_sessions row with reminder_sent_at = null
--   2. Insert appointment_notification_deliveries row:
--        notification_type = 'appointment-scheduled'
--        recipient_role = 'athlete'
--        delivery_status = 'claimed'
--   3. Call:
--        select public.complete_appointment_reminder_delivery('<delivery_id>', true, null);
--   4. Expect reminder_sent_at IS NULL on the session row

-- B. Athlete 2h reminder completion MUST set reminder_sent_at
--
-- Setup (DEV only):
--   1. Same session with reminder_sent_at = null
--   2. Insert delivery row:
--        notification_type = 'appointment-athlete-reminder-2h'
--        recipient_role = 'athlete'
--        delivery_status = 'claimed'
--   3. Call complete_appointment_reminder_delivery(..., true, null)
--   4. Expect reminder_sent_at IS NOT NULL

-- C. Coach RSVP completion must NOT set coach_reminder_sent_at
--
-- Setup (DEV only):
--   1. Session with coach_reminder_sent_at = null
--   2. Insert delivery row:
--        notification_type = 'appointment-athlete-confirmed'
--        recipient_role = 'coach'
--        delivery_status = 'claimed'
--   3. Call complete_appointment_reminder_delivery(..., true, null)
--   4. Expect coach_reminder_sent_at IS NULL

-- D. Coach 2h reminder completion MUST set coach_reminder_sent_at
--
-- Setup (DEV only):
--   1. Session with coach_reminder_sent_at = null
--   2. Insert delivery row:
--        notification_type = 'appointment-coach-reminder-2h'
--        recipient_role = 'coach'
--        delivery_status = 'claimed'
--   3. Call complete_appointment_reminder_delivery(..., true, null)
--   4. Expect coach_reminder_sent_at IS NOT NULL

-- Automated function-definition check:

select pg_get_functiondef(
  to_regprocedure('public.complete_appointment_reminder_delivery(uuid, boolean, text)')
) as complete_appointment_reminder_delivery_def;

-- Expected body contains EXACT guards:
--   v_row.notification_type = 'appointment-athlete-reminder-2h'
--   v_row.notification_type = 'appointment-coach-reminder-2h'
-- Expected body does NOT contain:
--   v_row.recipient_role = 'athlete'
--   v_row.recipient_role = 'coach'

select
  pg_get_functiondef(
    to_regprocedure('public.complete_appointment_reminder_delivery(uuid, boolean, text)')
  ) like '%notification_type = ''appointment-athlete-reminder-2h''%' as guards_athlete_reminder_type,
  pg_get_functiondef(
    to_regprocedure('public.complete_appointment_reminder_delivery(uuid, boolean, text)')
  ) like '%notification_type = ''appointment-coach-reminder-2h''%' as guards_coach_reminder_type,
  pg_get_functiondef(
    to_regprocedure('public.complete_appointment_reminder_delivery(uuid, boolean, text)')
  ) not like '%recipient_role = ''athlete''%' as no_recipient_role_athlete_guard,
  pg_get_functiondef(
    to_regprocedure('public.complete_appointment_reminder_delivery(uuid, boolean, text)')
  ) not like '%recipient_role = ''coach''%' as no_recipient_role_coach_guard;

-- Expected:
--   guards_athlete_reminder_type = true
--   guards_coach_reminder_type = true
--   no_recipient_role_athlete_guard = true
--   no_recipient_role_coach_guard = true
