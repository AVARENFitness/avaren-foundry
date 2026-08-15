-- AVAREN 8.11 — Main account ONE-TIME athlete reset
-- DO NOT RUN without reviewing AVAREN_MAIN_ACCOUNT_ATHLETE_RESET_PRECHECK.sql output.
-- DO NOT COMMIT execution to production automation — manual operator only.
--
-- What this does:
--   Wipes ATHLETE-SUBJECT data for the primary AVAREN owner account while
--   preserving all COACH/BUSINESS data where the same user is coach_id.
--
-- What this does NOT do:
--   • delete auth.users
--   • delete coach business clients / passes / ledger / appointments
--   • delete assignments where the main user is athlete subject (includes self-assigned test rows)
--   • delete coach_programs / coach_workout_templates (reusable definitions preserved)
--   • delete push_subscriptions
--   • delete user_profiles / coach_allowlist
--
-- Rollback:
--   Rows are copied into schema _avaren_reset_backup before mutation.
--   See AVAREN_MAIN_ACCOUNT_ATHLETE_RESET_VERIFICATION.sql and rollback notes below.

begin;

-- ── 0. HARD SAFETY GUARD ────────────────────────────────────────────────────
-- Paste UUID from PRECHECK section A before running:
--   select id from auth.users where lower(email) = lower('hello@avarenfitness.com');

do $$
declare
  v_expected_email constant text := 'hello@avarenfitness.com';
  v_expected_user_id constant uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE FROM PRECHECK
  v_resolved_user_id uuid;
  v_resolved_email text;
begin
  select u.id, u.email
  into v_resolved_user_id, v_resolved_email
  from auth.users as u
  where lower(u.email) = lower(v_expected_email)
  limit 1;

  if v_resolved_user_id is null then
    raise exception 'ABORT: primary owner account % not found in auth.users', v_expected_email;
  end if;

  if v_expected_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'ABORT: replace v_expected_user_id with the UUID from PRECHECK before running';
  end if;

  if v_resolved_user_id is distinct from v_expected_user_id then
    raise exception
      'ABORT: resolved user % does not match expected guard UUID %',
      v_resolved_user_id,
      v_expected_user_id;
  end if;

  if not exists (
    select 1
    from public.coach_allowlist as ca
    where lower(ca.email) = lower(v_expected_email)
  ) then
    raise exception 'ABORT: % is not present on coach_allowlist', v_expected_email;
  end if;

  raise notice 'Athlete reset target confirmed: % (%)', v_resolved_email, v_resolved_user_id;
end $$;

-- ── 1. Backup schema (recoverable, droppable after verification) ────────────

create schema if not exists _avaren_reset_backup;

create table if not exists _avaren_reset_backup.foundry_state (
  backed_up_at timestamptz not null default now(),
  user_id uuid,
  state jsonb,
  schema_version integer,
  updated_at timestamptz
);

create table if not exists _avaren_reset_backup.nutrition_days (
  backed_up_at timestamptz not null default now(),
  user_id uuid,
  log_date date,
  snapshot jsonb,
  updated_at timestamptz
);

create table if not exists _avaren_reset_backup.athlete_weekly_check_ins (
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null
);

create table if not exists _avaren_reset_backup.coach_assignments (
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null
);

create table if not exists _avaren_reset_backup.coach_notifications (
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null
);

create table if not exists _avaren_reset_backup.appointment_notification_deliveries (
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null
);

-- ── 2. Resolve target once for DML ──────────────────────────────────────────

do $$
declare
  v_target_user_id uuid;
  v_now timestamptz := now();
  v_defaults jsonb;
begin
  -- Mirror docs/supabase/AVAREN_MAIN_ACCOUNT_ATHLETE_RESET_FOUNDRY_DEFAULTS.json
  -- and src/data/defaultProgram.js + App createInitialState weeklySchedule.
  v_defaults := jsonb_build_object(
    'program', '{"rotation":["Chest + Back","Arms","Legs + Core"],"nextWorkout":"Legs + Core","workouts":{"Chest + Back":[{"name":"Bench Press","sets":6,"muscle":"Chest"},{"name":"Incline Press Machine","sets":3,"muscle":"Chest"},{"name":"Decline Press Machine","sets":3,"muscle":"Chest"},{"name":"Lat Pulldowns","sets":3,"muscle":"Back"},{"name":"Single-Arm Cable Pulldowns","sets":3,"muscle":"Back"},{"name":"Seated Cable Rows","sets":3,"muscle":"Back"},{"name":"Back Extension Machine","sets":3,"muscle":"Lower Back"}],"Arms":[{"name":"Standing Barbell Press","sets":5,"muscle":"Shoulders"},{"name":"Barbell Shrugs","sets":3,"muscle":"Traps"},{"name":"Dumbbell Lateral Raise","sets":3,"muscle":"Shoulders","supersetGroup":"A"},{"name":"Incline Dumbbell Curls","sets":3,"muscle":"Biceps","supersetGroup":"A"},{"name":"Dumbbell Preacher Hammer Curls","sets":3,"muscle":"Biceps"},{"name":"Single-Arm Cable Pushdown","sets":3,"muscle":"Triceps"},{"name":"V-Bar Pushdowns","sets":3,"muscle":"Triceps"},{"name":"Single-Arm Rear-Delt Cable Flys","sets":3,"muscle":"Rear Delts"}],"Legs + Core":[{"name":"Barbell Squats","sets":5,"muscle":"Quads"},{"name":"Lying Leg Curls","sets":3,"muscle":"Hamstrings"},{"name":"Single-Leg Extensions","sets":3,"muscle":"Quads"},{"name":"Calf Extensions","sets":3,"muscle":"Calves"},{"name":"Weighted Leg Lifts","sets":3,"muscle":"Core"},{"name":"Mason Twist","sets":3,"muscle":"Core"},{"name":"Toe Touches","sets":3,"muscle":"Core"}]}}'::jsonb,
    'weeklySchedule', '{"0":"Rest","1":"Chest + Back","2":"Arms","3":"Legs + Core","4":"Chest + Back","5":"Arms","6":"Legs + Core"}'::jsonb,
    'selectedWorkout', '"Legs + Core"'::jsonb,
    'baselines', '{"Bench Press":225,"Barbell Squats":225,"Standing Barbell Press":135}'::jsonb
  );

  select u.id
  into v_target_user_id
  from auth.users as u
  where lower(u.email) = lower('hello@avarenfitness.com')
  limit 1;

  -- Backup athlete-personal rows
  insert into _avaren_reset_backup.foundry_state (user_id, state, schema_version, updated_at)
  select fs.user_id, fs.state, fs.schema_version, fs.updated_at
  from public.foundry_state as fs
  where fs.user_id = v_target_user_id;

  insert into _avaren_reset_backup.nutrition_days (user_id, log_date, snapshot, updated_at)
  select nd.user_id, nd.log_date, nd.snapshot, nd.updated_at
  from public.nutrition_days as nd
  where nd.user_id = v_target_user_id;

  insert into _avaren_reset_backup.athlete_weekly_check_ins (row_data)
  select to_jsonb(awci)
  from public.athlete_weekly_check_ins as awci
  where awci.athlete_id = v_target_user_id;

  insert into _avaren_reset_backup.coach_assignments (row_data)
  select to_jsonb(ca)
  from public.coach_assignments as ca
  where ca.athlete_id = v_target_user_id;

  insert into _avaren_reset_backup.coach_notifications (row_data)
  select to_jsonb(cn)
  from public.coach_notifications as cn
  where cn.recipient_id = v_target_user_id
    and cn.type in (
      'appointment-scheduled',
      'appointment-rescheduled',
      'appointment-cancelled',
      'appointment-athlete-reminder-2h',
      'assignment-created',
      'assignment-due',
      'assignment-overdue'
    );

  insert into _avaren_reset_backup.appointment_notification_deliveries (row_data)
  select to_jsonb(d)
  from public.appointment_notification_deliveries as d
  where d.recipient_user_id = v_target_user_id
    and d.recipient_role = 'athlete';

  -- Class A/C deletes — athlete subject only, never coach-owned business rows

  delete from public.appointment_notification_deliveries as d
  where d.recipient_user_id = v_target_user_id
    and d.recipient_role = 'athlete';

  delete from public.coach_notifications as cn
  where cn.recipient_id = v_target_user_id
    and cn.type in (
      'appointment-scheduled',
      'appointment-rescheduled',
      'appointment-cancelled',
      'appointment-athlete-reminder-2h',
      'assignment-created',
      'assignment-due',
      'assignment-overdue'
    );

  delete from public.coach_client_followups as f
  where f.athlete_id = v_target_user_id;

  delete from public.coach_schedule_items as csi
  where csi.athlete_id = v_target_user_id;

  delete from public.coach_assignments as ca
  where ca.athlete_id = v_target_user_id;

  delete from public.coach_session_history as csh
  where csh.athlete_id = v_target_user_id;

  delete from public.coach_session_packages as csp
  where csp.athlete_id = v_target_user_id;

  delete from public.athlete_weekly_check_ins as awci
  where awci.athlete_id = v_target_user_id;

  delete from public.nutrition_days as nd
  where nd.user_id = v_target_user_id;

  -- foundry_state: patch athlete behavioral JSON + rebuild program defaults
  update public.foundry_state as fs
  set
    state = coalesce(fs.state, '{}'::jsonb)
      || jsonb_build_object(
        'program', v_defaults -> 'program',
        'weeklySchedule', v_defaults -> 'weeklySchedule',
        'selectedWorkout', v_defaults -> 'selectedWorkout',
        'baselines', v_defaults -> 'baselines',
        'activeWorkout', null,
        'history', '[]'::jsonb,
        'achievements', '[]'::jsonb,
        'sessionExecutionPlan', null,
        'athleteFollowUps', '[]'::jsonb,
        'mobility', coalesce(fs.state -> 'mobility', '{}'::jsonb)
          || jsonb_build_object('completed', '[]'::jsonb),
        'readiness', jsonb_build_object(
          'entries', '[]'::jsonb,
          'lastPromptedDate', null
        ),
        'notifications', jsonb_build_object(
          'read', '[]'::jsonb,
          'dismissed', '[]'::jsonb,
          'actedOn', '[]'::jsonb
        ),
        'coach', jsonb_build_object('history', '[]'::jsonb, 'lastShownInsight', null),
        'coachWorkspace', jsonb_build_object(
          'role', coalesce(fs.state -> 'coachWorkspace' ->> 'role', 'athlete'),
          'modeEnabled', coalesce((fs.state -> 'coachWorkspace' ->> 'modeEnabled')::boolean, false),
          'clients', '[]'::jsonb,
          'invitations', '[]'::jsonb,
          'assignments', '[]'::jsonb
        ),
        'nutrition', coalesce(fs.state -> 'nutrition', '{}'::jsonb)
          || jsonb_build_object('days', '{}'::jsonb, 'recentFoodIds', '[]'::jsonb),
        'onboarding', coalesce(fs.state -> 'onboarding', '{}'::jsonb)
          || jsonb_build_object('completed', true),
        'lastSavedAt', to_jsonb(v_now)
      ),
    updated_at = v_now
  where fs.user_id = v_target_user_id;

  raise notice 'Athlete reset complete for user %', v_target_user_id;
end $$;

commit;

-- Rollback (manual, if needed before dropping backup schema):
--   begin;
--   -- restore foundry_state / nutrition_days / athlete_weekly_check_ins / etc.
--   -- from _avaren_reset_backup using latest backed_up_at per table
--   commit;
--
-- After successful verification:
--   drop schema _avaren_reset_backup cascade;
