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

-- ── B. REJECTED — do not create coach_client_pass_adjustments ─────────────────
-- Superseded by AVAREN 8.4.1 canonical ledger:
--   coach_business_clients → coach_client_passes → coach_client_pass_ledger
-- Reasons: required athlete_id (blocks non-app clients), duplicate truth vs ledger,
-- athlete SELECT exposed coach-private reasons. All adjustments = immutable ledger rows.
-- Part A (athlete history RPC) may still be adopted independently — see 8.4.1D.

notify pgrst, 'reload schema';

commit;

-- Usage derivation policy (app layer):
--   completed appointment  → consumes one credit (via existing completion RPC)
--   cancelled              → no credit
--   missed                 → no credit (default; future business rule)
--   scheduled              → no credit
--   rescheduled            → same row, no additional credit
