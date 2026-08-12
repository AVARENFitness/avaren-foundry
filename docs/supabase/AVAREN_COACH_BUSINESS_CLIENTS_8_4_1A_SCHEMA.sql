-- AVAREN Sprint 8.4.4 — Business client + pass ledger SCHEMA (PROPOSAL)
-- Supersedes 8.4.1A. DO NOT RUN AUTOMATICALLY — execute only after approval.
--
-- Supersedes AVAREN_COACH_BUSINESS_CLIENTS_8_4_PROPOSAL.sql
-- Phase A: tables + integrity triggers only. No athlete RLS. No nullable athlete_id yet.

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. CANONICAL BUSINESS CLIENT
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_business_clients (
  id uuid primary key default gen_random_uuid(),

  -- RESTRICT: deleting coach auth must not destroy business records
  coach_id uuid not null references auth.users(id) on delete restrict,

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

  constraint coach_business_clients_dates_check
    check (ended_at is null or started_at is null or ended_at >= started_at)
);

-- One linked auth user per coach; multiple offline (linked_user_id null) allowed
create unique index if not exists coach_business_clients_coach_linked_user_unique
  on public.coach_business_clients (coach_id, linked_user_id)
  where linked_user_id is not null;

create index if not exists coach_business_clients_coach_status_idx
  on public.coach_business_clients (coach_id, status, created_at desc);

create index if not exists coach_business_clients_coach_name_idx
  on public.coach_business_clients (coach_id, lower(display_name), lower(preferred_name));

create index if not exists coach_business_clients_linked_user_idx
  on public.coach_business_clients (linked_user_id)
  where linked_user_id is not null;

comment on table public.coach_business_clients is
  'Canonical coach business client. Coach-private. Athlete access via SECURITY DEFINER RPCs only.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. COACH-PRIVATE BUSINESS NOTES
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_business_client_notes (
  business_client_id uuid primary key
    references public.coach_business_clients(id) on delete restrict,
  coach_id uuid not null references auth.users(id) on delete restrict,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. BRIDGE (coach_clients extension — Phase A additive column)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_clients
  add column if not exists business_client_id uuid
    references public.coach_business_clients(id) on delete set null;

create unique index if not exists coach_clients_business_client_unique
  on public.coach_clients (business_client_id)
  where business_client_id is not null;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. SESSION PASSES (grant metadata — balance NOT stored)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_client_passes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete restrict,
  business_client_id uuid not null
    references public.coach_business_clients(id) on delete restrict,

  name text not null default 'Training pass',

  -- Immutable descriptive metadata at creation (audit reference only).
  -- Canonical credited quantity = initial PURCHASE ledger entry.
  sessions_purchased integer not null check (sessions_purchased > 0),

  status text not null default 'active'
    check (status in ('active', 'expired', 'archived')),

  -- NO UTC default — must be supplied by RPC from coach business-local date
  starts_at date not null,
  expires_at date,

  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coach_client_passes_dates_check
    check (expires_at is null or expires_at >= starts_at)
);

create index if not exists coach_client_passes_client_status_idx
  on public.coach_client_passes (coach_id, business_client_id, status, starts_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. SESSION CREDIT LEDGER (INSERT-only audit trail)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.coach_client_pass_ledger (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.coach_client_passes(id) on delete restrict,
  coach_id uuid not null references auth.users(id) on delete restrict,
  business_client_id uuid not null
    references public.coach_business_clients(id) on delete restrict,

  entry_type text not null check (
    entry_type in (
      'purchase',                 -- initial grant (+)
      'session_used',             -- completed appointment debit (-)
      'no_show_charged',          -- explicit missed-session debit (-)
      'bonus',                    -- comp credit (+)
      'manual_credit',            -- coach adjustment (+), reason required
      'manual_debit',             -- coach adjustment (-), reason required
      'credit_restored',          -- returned previously consumed credit (+)
      'package_refund',           -- remove purchased entitlement (-)
      'expired_forfeit',          -- expiry debit (-)
      'legacy_migration_debit'    -- one-time migration aggregate consumed (-)
    )
  ),

  quantity integer not null check (quantity <> 0),

  scheduled_session_id uuid references public.coach_scheduled_sessions(id) on delete restrict,
  reason text not null default '',

  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  -- Sign rules enforced by trigger (see below)
  constraint coach_client_pass_ledger_reason_manual_check check (
    entry_type not in (
      'manual_credit', 'manual_debit', 'credit_restored',
      'package_refund', 'bonus'
    )
    or length(trim(reason)) >= 3
  )
);

-- ONE appointment → at most ONE usage debit across ALL passes
create unique index if not exists coach_client_pass_ledger_one_usage_per_appointment
  on public.coach_client_pass_ledger (scheduled_session_id)
  where scheduled_session_id is not null
    and entry_type in ('session_used', 'no_show_charged');

create index if not exists coach_client_pass_ledger_pass_idx
  on public.coach_client_pass_ledger (pass_id, created_at desc);

create index if not exists coach_client_pass_ledger_client_idx
  on public.coach_client_pass_ledger (business_client_id, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. APPOINTMENT LINKAGE (Phase A — column only; athlete_id still NOT NULL)
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.coach_scheduled_sessions
  add column if not exists business_client_id uuid
    references public.coach_business_clients(id) on delete restrict;

alter table public.coach_scheduled_sessions
  add column if not exists missed_charge_decision text
    check (missed_charge_decision in ('charge', 'no_charge'));

alter table public.coach_scheduled_sessions
  add column if not exists missed_charge_decided_at timestamptz;

-- Invitation extension (acceptance RPC in 8.4.1D)
alter table public.coach_invitations
  add column if not exists business_client_id uuid
    references public.coach_business_clients(id) on delete set null;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. DERIVED BALANCE VIEW (coach-only; not athlete-facing)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace view public.coach_client_pass_balances
with (security_invoker = true) as
select
  p.id as pass_id,
  p.coach_id,
  p.business_client_id,
  p.name,
  p.sessions_purchased,
  p.status as pass_status,
  p.starts_at,
  p.expires_at,
  coalesce(sum(l.quantity), 0)::integer as balance
from public.coach_client_passes as p
left join public.coach_client_pass_ledger as l on l.pass_id = p.id
group by p.id;

commit;
