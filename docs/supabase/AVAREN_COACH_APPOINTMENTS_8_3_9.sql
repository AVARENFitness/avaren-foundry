-- AVAREN Sprint 8.3.9 — Fix list_athlete_scheduled_sessions composite ORDER BY
-- DO NOT RUN AUTOMATICALLY — execute in Supabase SQL Editor.
--
-- Live error (42P01):
--   missing FROM-clause entry for table "session_row"
--
-- Cause: ORDER BY scoped.session_row.starts_at inside jsonb_agg treats
-- session_row as a relation name, not composite-field access.
--
-- Fix: expose s.starts_at as session_starts_at scalar; order by that.
-- Recreates ONLY public.list_athlete_scheduled_sessions(). No data changes.

begin;

create or replace function public.list_athlete_scheduled_sessions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      public.athlete_scheduled_session_public_json(
        scoped.session_row,
        scoped.coach_display_name,
        scoped.linked_workout_title
      )
      order by scoped.session_starts_at
    )
    from (
      select
        s as session_row,
        s.starts_at as session_starts_at,
        public.resolve_user_public_display_name(s.coach_id) as coach_display_name,
        case
          when a.id is not null and a.athlete_id = s.athlete_id then a.title
          else null
        end as linked_workout_title
      from public.coach_scheduled_sessions as s
      left join public.coach_assignments as a
        on a.id = s.assignment_id
       and a.athlete_id = s.athlete_id
       and a.coach_id = s.coach_id
      where s.athlete_id = v_athlete_id
        and s.status = 'scheduled'
        and s.starts_at is not null
        and s.starts_at >= pg_catalog.now()
    ) as scoped
  ), '[]'::jsonb);
end;
$$;

alter function public.list_athlete_scheduled_sessions() owner to postgres;

revoke all on function public.list_athlete_scheduled_sessions() from public;
grant execute on function public.list_athlete_scheduled_sessions() to authenticated;

commit;

notify pgrst, 'reload schema';

-- Post-run (athlete JWT):
--   select public.list_athlete_scheduled_sessions();
--
-- Pass gate:
--   RPC status: success · RPC results >= 1 · Canonical >= 1 · Next appointment: yes
