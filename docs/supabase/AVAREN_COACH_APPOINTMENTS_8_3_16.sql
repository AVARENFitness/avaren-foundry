-- AVAREN Sprint 8.3.16 — Athlete appointment history RPC + pass ledger foundation
-- DO NOT RUN AUTOMATICALLY — execute in Supabase SQL Editor after review.
--
-- Part A: Athlete-safe appointment history (no coach notes).
-- Part B: Pass adjustment ledger (operational foundation — no payments).

begin;

-- ── A. Athlete appointment history RPC ───────────────────────────────────────

create or replace function public.list_athlete_scheduled_session_history(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        public.athlete_scheduled_session_public_json(
          s,
          public.resolve_user_public_display_name(s.coach_id),
          (
            select a.title
            from public.coach_assignments as a
            where a.id = s.assignment_id
              and a.athlete_id = s.athlete_id
              and a.coach_id = s.coach_id
            limit 1
          )
        )
        order by coalesce(s.starts_at, s.session_date::timestamptz) desc
      )
      from public.coach_scheduled_sessions as s
      where s.athlete_id = v_athlete_id
        and s.status in ('completed', 'cancelled', 'missed')
      limit v_limit
    ),
    '[]'::jsonb
  );
end;
$$;

alter function public.list_athlete_scheduled_session_history(integer) owner to postgres;
revoke all on function public.list_athlete_scheduled_session_history(integer) from public;
grant execute on function public.list_athlete_scheduled_session_history(integer) to authenticated;

-- ── B. Pass adjustment ledger (proposal — complements coach_session_packages) ─

create table if not exists public.coach_client_pass_adjustments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid references public.coach_session_packages(id) on delete set null,
  adjustment_type text not null check (
    adjustment_type in ('bonus', 'correction', 'transfer', 'comp', 'manual_debit')
  ),
  session_delta integer not null check (session_delta <> 0),
  reason text not null default '',
  related_appointment_id uuid references public.coach_scheduled_sessions(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists coach_client_pass_adjustments_client_idx
  on public.coach_client_pass_adjustments (coach_id, athlete_id, created_at desc);

alter table public.coach_client_pass_adjustments enable row level security;

drop policy if exists coach_client_pass_adjustments_coach_all
  on public.coach_client_pass_adjustments;
create policy coach_client_pass_adjustments_coach_all
  on public.coach_client_pass_adjustments
for all to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (
  coach_id = auth.uid()
  and public.is_avaren_coach()
  and exists (
    select 1 from public.coach_clients as cc
    where cc.coach_id = auth.uid()
      and cc.athlete_id = coach_client_pass_adjustments.athlete_id
  )
);

drop policy if exists coach_client_pass_adjustments_athlete_select
  on public.coach_client_pass_adjustments;
create policy coach_client_pass_adjustments_athlete_select
  on public.coach_client_pass_adjustments
for select to authenticated
using (athlete_id = auth.uid());

notify pgrst, 'reload schema';

commit;

-- Usage derivation policy (app layer):
--   completed appointment  → consumes one credit (via existing completion RPC)
--   cancelled              → no credit
--   missed                 → no credit (default; future business rule)
--   scheduled              → no credit
--   rescheduled            → same row, no additional credit
