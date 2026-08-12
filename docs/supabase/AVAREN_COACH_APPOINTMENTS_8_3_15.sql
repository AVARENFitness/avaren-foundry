-- AVAREN Sprint 8.3.15 — Fix followup_insert_invalid_scheduled_session (RLS blind trigger)
-- DO NOT RUN AUTOMATICALLY — execute in Supabase SQL Editor.
--
-- Root cause: enforce_coach_client_followup_insert() runs as SECURITY INVOKER.
-- Athletes have no SELECT policy on public.coach_scheduled_sessions (by design —
-- sessions are exposed only via SECURITY DEFINER RPCs). The trigger's scheduled-
-- session EXISTS check therefore always fails for athlete inserts even when
-- coach_id, athlete_id, and scheduled_session_id are all correct.
--
-- Fix: SECURITY DEFINER on the insert trigger function (same pattern as
-- update_scheduled_session_rsvp). auth.uid() self-submit checks are preserved.

begin;

create or replace function public.enforce_coach_client_followup_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.athlete_id is distinct from auth.uid() then
    raise exception 'followup_insert_not_self';
  end if;

  if not exists (
    select 1
    from public.coach_clients as cc
    where cc.coach_id = new.coach_id
      and cc.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_unauthorized_coach';
  end if;

  if new.assignment_id is not null and not exists (
    select 1
    from public.coach_assignments as ca
    where ca.id = new.assignment_id
      and ca.coach_id = new.coach_id
      and ca.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_invalid_assignment';
  end if;

  if new.scheduled_session_id is not null and not exists (
    select 1
    from public.coach_scheduled_sessions as ss
    where ss.id = new.scheduled_session_id
      and ss.coach_id = new.coach_id
      and ss.athlete_id = new.athlete_id
  ) then
    raise exception 'followup_insert_invalid_scheduled_session';
  end if;

  new.summary := trim(new.summary);
  new.session_id := nullif(trim(new.session_id), '');
  new.status := 'open';
  new.reviewed_at := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

alter function public.enforce_coach_client_followup_insert() owner to postgres;

revoke all on function public.enforce_coach_client_followup_insert() from public;
revoke all on function public.enforce_coach_client_followup_insert() from authenticated;
revoke all on function public.enforce_coach_client_followup_insert() from anon;

notify pgrst, 'reload schema';

commit;

-- Verify (optional):
-- select p.prosecdef, pg_get_functiondef(p.oid)
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'enforce_coach_client_followup_insert';
