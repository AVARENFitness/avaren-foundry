-- AVAREN 8.7.2 — Coaching requirements precheck (read-only, column-safe)
-- Run BEFORE AVAREN_COACH_CLIENT_REQUIREMENTS_8_7_MIGRATION.sql
-- STOP if any blocking metric > 0:
--   clientsWithInvalidWeeklyCheckIn
--   duplicateActiveLinkedRelationships
--
-- Safe on:
--   A) fresh databases where coaching_requirements does not exist yet
--   B) re-runs after partial or completed migration

create temp table _avaren_coach_requirements_precheck (
  metric text primary key,
  value bigint not null
) on commit drop;

-- ── Column state (informational) ──────────────────────────────────────────────
-- 0 = expected fresh pre-migration state
-- 1 = column already present

insert into _avaren_coach_requirements_precheck (metric, value)
select 'coachingRequirementsColumnExists' as metric,
       count(*)::bigint as value
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_business_clients'
  and column_name = 'coaching_requirements';

-- ── Blocking: duplicate active linked relationships per athlete ─────────────
-- Does not reference coaching_requirements.

insert into _avaren_coach_requirements_precheck (metric, value)
select 'duplicateActiveLinkedRelationships' as metric,
       count(*)::bigint as value
from (
  select cc.athlete_id, count(distinct bc.id) as relationship_count
  from public.coach_business_clients as bc
  join public.coach_clients as cc
    on cc.business_client_id = bc.id
   and cc.coach_id = bc.coach_id
   and cc.athlete_id = bc.linked_user_id
  where bc.status = 'active'
    and bc.linked_user_id is not null
  group by cc.athlete_id
  having count(distinct bc.id) > 1
) as dup;

-- ── Informational counts (no coaching_requirements reference) ─────────────────

insert into _avaren_coach_requirements_precheck (metric, value)
select 'activeConnectedClients' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'active'
  and bc.linked_user_id is not null;

insert into _avaren_coach_requirements_precheck (metric, value)
select 'activeOfflineClients' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'active'
  and bc.linked_user_id is null;

insert into _avaren_coach_requirements_precheck (metric, value)
select 'archivedClients' as metric,
       count(*)::bigint as value
from public.coach_business_clients as bc
where bc.status = 'archived';

-- ── Column-dependent metrics (dynamic SQL; read-only on permanent schema) ───────

do $avaren_precheck$
declare
  v_column_exists boolean := false;
  v_invalid bigint := 0;
  v_missing bigint := 0;
  v_total_clients bigint := 0;
begin
  select exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'coach_business_clients'
      and c.column_name = 'coaching_requirements'
  )
  into v_column_exists;

  select count(*)::bigint
  into v_total_clients
  from public.coach_business_clients as bc;

  if v_column_exists then
    execute $sql$
      select count(*)::bigint
      from public.coach_business_clients as bc
      where not (
        bc.coaching_requirements ? 'weekly_check_in'
        and bc.coaching_requirements->>'weekly_check_in' in ('required', 'not_required')
      )
    $sql$
    into v_invalid;

    execute $sql$
      select count(*)::bigint
      from public.coach_business_clients as bc
      where bc.coaching_requirements is null
    $sql$
    into v_missing;
  else
    -- No stored requirement values exist yet; nothing to invalidate pre-migration.
    v_invalid := 0;
    -- Informational sentinel: all business clients will receive the migration default.
    v_missing := v_total_clients;
  end if;

  insert into _avaren_coach_requirements_precheck (metric, value)
  values
    ('clientsWithInvalidWeeklyCheckIn', v_invalid),
    ('clientsMissingRequirements', v_missing)
  on conflict (metric) do update
    set value = excluded.value;
end
$avaren_precheck$;

select metric, value
from _avaren_coach_requirements_precheck
order by metric;
