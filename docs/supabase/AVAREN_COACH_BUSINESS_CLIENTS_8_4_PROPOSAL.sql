-- AVAREN Sprint 8.4 — Business Client Records + Session Pass Ledger (PROPOSAL)
-- SUPERSEDED by 8.4.1 hardened migration:
--   AVAREN_COACH_BUSINESS_CLIENTS_8_4_1A_SCHEMA.sql
--   AVAREN_COACH_BUSINESS_CLIENTS_8_4_1A_INTEGRITY.sql
--   AVAREN_COACH_BUSINESS_CLIENTS_8_4_1B_BACKFILL.sql
--   AVAREN_COACH_BUSINESS_CLIENTS_8_4_1C_VERIFICATION.sql
--   AVAREN_COACH_BUSINESS_CLIENTS_8_4_1D_RLS_RPC.sql
-- DO NOT RUN THIS FILE.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- A. CANONICAL BUSINESS CLIENT
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_business_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,

  -- Optional link to auth.users — NULL for offline/non-app clients
  linked_user_id uuid references auth.users(id) on delete set null,

  first_name text not null default '',
  last_name text not null default '',
  preferred_name text not null default '',
  display_name text not null default '',

  email text,
  phone text,

  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),

  started_at date,
  ended_at date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- At most one linked auth user per coach roster slot
  constraint coach_business_clients_linked_user_unique
    unique (coach_id, linked_user_id),

  -- Prevent duplicate link to same auth user under one coach
  constraint coach_business_clients_coach_link_check
    check (linked_user_id is null or coach_id is not null)
);

create index if not exists coach_business_clients_coach_status_idx
  on public.coach_business_clients (coach_id, status, created_at desc);

create index if not exists coach_business_clients_coach_name_idx
  on public.coach_business_clients (coach_id, lower(display_name), lower(preferred_name));

create index if not exists coach_business_clients_linked_user_idx
  on public.coach_business_clients (linked_user_id)
  where linked_user_id is not null;

comment on table public.coach_business_clients is
  'Canonical coach business client. Exists with or without AVAREN auth account.';

-- Coach-private business notes (separate from athlete-visible identity)
create table if not exists public.coach_business_client_notes (
  business_client_id uuid primary key
    references public.coach_business_clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- Bridge: existing coach_clients → business client (1:1 when linked)
alter table public.coach_clients
  add column if not exists business_client_id uuid
    references public.coach_business_clients(id) on delete set null;

create unique index if not exists coach_clients_business_client_unique
  on public.coach_clients (business_client_id)
  where business_client_id is not null;

-- ══════════════════════════════════════════════════════════════════════════════
-- B. SESSION PASSES (grant records — balance NOT stored here)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_client_passes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  business_client_id uuid not null
    references public.coach_business_clients(id) on delete restrict,

  name text not null default 'Training pass',
  sessions_purchased integer not null check (sessions_purchased > 0),

  status text not null default 'active'
    check (status in ('active', 'expired', 'archived')),

  starts_at date not null default (timezone('utc', now()))::date,
  expires_at date,

  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_client_passes_client_status_idx
  on public.coach_client_passes (coach_id, business_client_id, status, starts_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- C. SESSION CREDIT LEDGER (auditable source of truth)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_client_pass_ledger (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.coach_client_passes(id) on delete restrict,
  coach_id uuid not null references auth.users(id) on delete cascade,
  business_client_id uuid not null
    references public.coach_business_clients(id) on delete restrict,

  entry_type text not null check (
    entry_type in (
      'purchase',
      'session_used',
      'bonus',
      'manual_credit',
      'manual_debit',
      'refund',
      'correction',
      'expired_forfeit'
    )
  ),

  quantity integer not null check (quantity <> 0),

  scheduled_session_id uuid references public.coach_scheduled_sessions(id) on delete set null,
  reason text not null default '',

  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  -- Idempotency: one SESSION_USED per appointment per pass
  constraint coach_client_pass_ledger_session_used_unique
    unique (pass_id, scheduled_session_id, entry_type)
    deferrable initially deferred
);

create index if not exists coach_client_pass_ledger_pass_idx
  on public.coach_client_pass_ledger (pass_id, created_at desc);

create index if not exists coach_client_pass_ledger_client_idx
  on public.coach_client_pass_ledger (business_client_id, created_at desc);

-- Balance view (derived — never write remaining_sessions directly)
create or replace view public.coach_client_pass_balances as
select
  p.id as pass_id,
  p.coach_id,
  p.business_client_id,
  p.name,
  p.status as pass_status,
  p.starts_at,
  p.expires_at,
  coalesce(sum(l.quantity), 0)::integer as balance
from public.coach_client_passes as p
left join public.coach_client_pass_ledger as l on l.pass_id = p.id
group by p.id;

-- ══════════════════════════════════════════════════════════════════════════════
-- D. APPOINTMENT LINKAGE (single truth — business_client_id canonical)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_scheduled_sessions
  add column if not exists business_client_id uuid
    references public.coach_business_clients(id) on delete restrict;

-- Transition: athlete_id nullable for non-app clients
-- (Requires phased migration — see backfill section in 8.4 design doc)
-- alter table public.coach_scheduled_sessions
--   alter column athlete_id drop not null;

-- Missed-session charge decision (coach explicit — no silent debit)
alter table public.coach_scheduled_sessions
  add column if not exists missed_charge_decision text
    check (missed_charge_decision in ('charge', 'no_charge'))
    default null;

-- ══════════════════════════════════════════════════════════════════════════════
-- E. BACKFILL (run once after table creation — idempotent pattern)
-- ══════════════════════════════════════════════════════════════════════════════

-- Step 1: Create business client for each existing coach_clients row
-- insert into public.coach_business_clients (
--   coach_id, linked_user_id, display_name, email, status, started_at
-- )
-- select
--   cc.coach_id,
--   cc.athlete_id,
--   coalesce(nullif(up.preferred_name, ''), nullif(up.display_name, ''), split_part(cc.athlete_email, '@', 1)),
--   cc.athlete_email,
--   'active',
--   cc.created_at::date
-- from public.coach_clients cc
-- left join public.user_profiles up on up.user_id = cc.athlete_id
-- where not exists (
--   select 1 from public.coach_business_clients bc
--   where bc.coach_id = cc.coach_id and bc.linked_user_id = cc.athlete_id
-- );

-- Step 2: Link coach_clients.business_client_id
-- update public.coach_clients cc
-- set business_client_id = bc.id
-- from public.coach_business_clients bc
-- where bc.coach_id = cc.coach_id
--   and bc.linked_user_id = cc.athlete_id
--   and cc.business_client_id is null;

-- Step 3: Backfill appointments.business_client_id from athlete_id
-- update public.coach_scheduled_sessions s
-- set business_client_id = bc.id
-- from public.coach_business_clients bc
-- where bc.coach_id = s.coach_id
--   and bc.linked_user_id = s.athlete_id
--   and s.business_client_id is null;

-- Step 4: Migrate coach_session_packages → coach_client_passes + ledger PURCHASE entries
-- (See design doc — dual-write period recommended)

-- ══════════════════════════════════════════════════════════════════════════════
-- F. RLS (coach-private by default; athlete reads own linked data only)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_business_clients enable row level security;
alter table public.coach_business_client_notes enable row level security;
alter table public.coach_client_passes enable row level security;
alter table public.coach_client_pass_ledger enable row level security;

-- Coach full access to own business clients
drop policy if exists coach_business_clients_coach_all on public.coach_business_clients;
create policy coach_business_clients_coach_all on public.coach_business_clients
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

-- Linked athlete may read own business client shell (safe fields via RPC only)
drop policy if exists coach_business_clients_linked_read on public.coach_business_clients;
create policy coach_business_clients_linked_read on public.coach_business_clients
for select to authenticated
using (linked_user_id = auth.uid());

-- Notes: coach only
drop policy if exists coach_business_client_notes_coach on public.coach_business_client_notes;
create policy coach_business_client_notes_coach on public.coach_business_client_notes
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

-- Passes: coach all; linked athlete SELECT balance via RPC
drop policy if exists coach_client_passes_coach_all on public.coach_client_passes;
create policy coach_client_passes_coach_all on public.coach_client_passes
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_client_passes_linked_read on public.coach_client_passes;
create policy coach_client_passes_linked_read on public.coach_client_passes
for select to authenticated
using (
  exists (
    select 1 from public.coach_business_clients bc
    where bc.id = coach_client_passes.business_client_id
      and bc.linked_user_id = auth.uid()
  )
);

-- Ledger: coach all; linked athlete SELECT own entries (safe subset via RPC)
drop policy if exists coach_client_pass_ledger_coach_all on public.coach_client_pass_ledger;
create policy coach_client_pass_ledger_coach_all on public.coach_client_pass_ledger
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop policy if exists coach_client_pass_ledger_linked_read on public.coach_client_pass_ledger;
create policy coach_client_pass_ledger_linked_read on public.coach_client_pass_ledger
for select to authenticated
using (
  exists (
    select 1 from public.coach_business_clients bc
    where bc.id = coach_client_pass_ledger.business_client_id
      and bc.linked_user_id = auth.uid()
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- G. INVITATION LINKING (extend existing flow)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_invitations
  add column if not exists business_client_id uuid
    references public.coach_business_clients(id) on delete set null;

-- accept_coach_invitation would:
--   1. set business_client.linked_user_id = auth.uid()
--   2. upsert coach_clients bridge row
--   3. NOT create duplicate business client

commit;

-- ROLLBACK NOTES:
--   • coach_clients + athlete_id paths remain until app migration complete
--   • coach_session_packages kept read-only during dual-write period
--   • Do NOT drop coach_session_packages until ledger migration verified
