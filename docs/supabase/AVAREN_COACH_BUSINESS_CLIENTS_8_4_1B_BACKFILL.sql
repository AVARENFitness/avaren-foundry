-- AVAREN Sprint 8.4.3 — Backfill business clients + deterministic legacy pass migration
-- Run AFTER 8_4_1B_PRECHECK (legacyPackageCounterInconsistencies = 0).
-- Run AFTER 8_4_1A_SCHEMA + 8_4_1A_INTEGRITY.
-- DO NOT RUN AUTOMATICALLY.

begin;

-- ── Step 1: Business client per existing coach_clients (structured identity) ──

insert into public.coach_business_clients (
  coach_id,
  linked_user_id,
  first_name,
  last_name,
  preferred_name,
  display_name,
  email,
  status,
  started_at
)
select
  cc.coach_id,
  cc.athlete_id,
  coalesce(nullif(btrim(up.first_name), ''), ''),
  coalesce(nullif(btrim(up.last_name), ''), ''),
  coalesce(nullif(btrim(up.preferred_name), ''), ''),
  coalesce(
    nullif(btrim(up.preferred_name), ''),
    nullif(btrim(up.display_name), ''),
    nullif(
      btrim(concat_ws(
        ' ',
        nullif(btrim(up.first_name), ''),
        nullif(btrim(up.last_name), '')
      )),
      ''
    ),
    split_part(cc.athlete_email, '@', 1)
  ),
  cc.athlete_email,
  'active',
  cc.created_at::date
from public.coach_clients as cc
left join public.user_profiles as up on up.user_id = cc.athlete_id
where not exists (
  select 1
  from public.coach_business_clients as bc
  where bc.coach_id = cc.coach_id
    and bc.linked_user_id = cc.athlete_id
);

-- ── Step 2: Bridge coach_clients.business_client_id ───────────────────────────

update public.coach_clients as cc
set business_client_id = bc.id
from public.coach_business_clients as bc
where bc.coach_id = cc.coach_id
  and bc.linked_user_id = cc.athlete_id
  and cc.business_client_id is null;

-- ── Step 3: Appointments.business_client_id from linked athlete ───────────────

update public.coach_scheduled_sessions as s
set business_client_id = bc.id
from public.coach_business_clients as bc
where bc.coach_id = s.coach_id
  and bc.linked_user_id = s.athlete_id
  and s.business_client_id is null;

-- ── Step 4: Legacy packages → passes (preserve counter metadata) ─────────────
-- sessions_purchased = legacy total_sessions (immutable audit label)

insert into public.coach_client_passes (
  id,
  coach_id,
  business_client_id,
  name,
  sessions_purchased,
  status,
  starts_at,
  expires_at,
  notes,
  created_at,
  updated_at
)
select
  pkg.id,
  pkg.coach_id,
  bc.id,
  'Migrated training pass',
  pkg.total_sessions,
  case
    when pkg.expires_at is not null
      and pkg.expires_at < timezone('utc', now())::date then 'expired'
    else 'active'
  end,
  coalesce(pkg.purchased_at, pkg.created_at::date),
  pkg.expires_at,
  format(
    'Migrated from coach_session_packages (total=%s used=%s remaining=%s)',
    pkg.total_sessions,
    pkg.sessions_used,
    pkg.sessions_remaining
  ),
  pkg.created_at,
  pkg.updated_at
from public.coach_session_packages as pkg
join public.coach_business_clients as bc
  on bc.coach_id = pkg.coach_id
 and bc.linked_user_id = pkg.athlete_id
where pkg.total_sessions > 0
  and pkg.total_sessions = (pkg.sessions_used + pkg.sessions_remaining)
  and not exists (
    select 1 from public.coach_client_passes as p where p.id = pkg.id
  );

-- ── Step 5: PURCHASE +original granted quantity (deterministic from counters) ─

insert into public.coach_client_pass_ledger (
  pass_id,
  coach_id,
  business_client_id,
  entry_type,
  quantity,
  scheduled_session_id,
  reason,
  created_by,
  created_at
)
select
  p.id,
  p.coach_id,
  p.business_client_id,
  'purchase',
  pkg.total_sessions,
  null,
  format('Legacy migration PURCHASE: %s sessions granted', pkg.total_sessions),
  p.coach_id,
  p.created_at
from public.coach_client_passes as p
join public.coach_session_packages as pkg on pkg.id = p.id
where not exists (
  select 1
  from public.coach_client_pass_ledger as l
  where l.pass_id = p.id
    and l.entry_type = 'purchase'
);

-- ── Step 6: ONE legacy_migration_debit per pass (NOT per appointment) ─────────
-- Represents aggregate legacy sessions_used without pretending appointment linkage.

insert into public.coach_client_pass_ledger (
  pass_id,
  coach_id,
  business_client_id,
  entry_type,
  quantity,
  scheduled_session_id,
  reason,
  created_by,
  created_at
)
select
  p.id,
  p.coach_id,
  p.business_client_id,
  'legacy_migration_debit',
  -pkg.sessions_used,
  null,
  format(
    'Legacy migration: %s sessions consumed per package counters (not appointment-linked)',
    pkg.sessions_used
  ),
  p.coach_id,
  p.created_at + interval '1 millisecond'
from public.coach_client_passes as p
join public.coach_session_packages as pkg on pkg.id = p.id
where pkg.sessions_used > 0
  and not exists (
    select 1
    from public.coach_client_pass_ledger as l
    where l.pass_id = p.id
      and l.entry_type = 'legacy_migration_debit'
  );

-- Post-migration balance check (read in same session):
-- balance should equal legacy sessions_remaining for each migrated pass.

commit;

-- DO NOT synthesize session_used rows from completed appointments during migration.
-- Future usage after migration uses record_completed_session_pass_usage() RPC.
