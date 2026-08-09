-- AVAREN Sprint 7.9.19 — DEV-only current-week weekly check-in reset RPC
-- Purpose: allow authenticated athletes to delete ONLY their own current coach-week
--          test submission during local development retesting.
--
-- DO NOT treat this as production product behavior.
-- REVOKE or DROP before production release:
--   drop function if exists public.dev_reset_current_weekly_check_in();
--
-- Why SECURITY DEFINER:
--   athlete_weekly_check_ins intentionally has SELECT/INSERT/UPDATE RLS only.
--   We avoid adding a general athlete DELETE policy. This function performs one
--   narrowly scoped delete after validating auth.uid() server-side.
--
-- Depends on: public.athlete_weekly_check_ins (AVAREN_ATHLETE_WEEKLY_CHECKIN_7_9_12.sql)

begin;

create or replace function public.dev_reset_current_weekly_check_in()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week_start date;
  v_week_end date;
  v_row_existed_before boolean := false;
  v_row_exists_after boolean := false;
  v_rows_affected integer := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Match app getCoachWeekRange(): Monday–Sunday coach week.
  v_week_start :=
    (current_date - ((extract(dow from current_date)::int + 6) % 7))::date;
  v_week_end := v_week_start + 6;

  select exists (
    select 1
    from public.athlete_weekly_check_ins awci
    where awci.athlete_id = v_user
      and awci.week_start = v_week_start
  )
  into v_row_existed_before;

  delete from public.athlete_weekly_check_ins awci
  where awci.athlete_id = v_user
    and awci.week_start = v_week_start;

  get diagnostics v_rows_affected = row_count;

  select exists (
    select 1
    from public.athlete_weekly_check_ins awci
    where awci.athlete_id = v_user
      and awci.week_start = v_week_start
  )
  into v_row_exists_after;

  return jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_end,
    'row_existed_before', v_row_existed_before,
    'rows_affected', v_rows_affected,
    'row_exists_after', v_row_exists_after,
    'deleted', v_row_existed_before and not v_row_exists_after
  );
end;
$$;

revoke all on function public.dev_reset_current_weekly_check_in() from public;
grant execute on function public.dev_reset_current_weekly_check_in() to authenticated;

commit;

-- Removal before production:
--   drop function if exists public.dev_reset_current_weekly_check_in();
