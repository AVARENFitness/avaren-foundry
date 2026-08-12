-- AVAREN Sprint 8.4.4 — Legacy package pre-migration audit (read-only)
-- Run BEFORE 8_4_1B_BACKFILL.
-- STOP if legacyPackageCounterInconsistencies > 0 — reconcile manually first.
-- DO NOT RUN AUTOMATICALLY alongside writes unless intentional.

-- ── Legacy counter inconsistencies (must be 0 before backfill) ────────────────
-- Expected invariant: total_sessions = sessions_used + sessions_remaining

select
  'legacyPackageCounterInconsistencies' as metric,
  count(*)::bigint as value
from public.coach_session_packages as pkg
where pkg.total_sessions <> (pkg.sessions_used + pkg.sessions_remaining);

-- Detail rows for manual reconciliation
select
  pkg.id,
  pkg.coach_id,
  pkg.athlete_id,
  pkg.total_sessions,
  pkg.sessions_used,
  pkg.sessions_remaining,
  (pkg.sessions_used + pkg.sessions_remaining) as computed_total
from public.coach_session_packages as pkg
where pkg.total_sessions <> (pkg.sessions_used + pkg.sessions_remaining);

-- Packages with zero total (skipped by migration — report only)
select
  'legacyPackagesZeroTotal' as metric,
  count(*)::bigint as value
from public.coach_session_packages
where total_sessions <= 0;
