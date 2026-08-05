-- AVAREN Sprint 6.6.1
-- Assignment lifecycle cleanup and permanent deletion

begin;

create or replace function public.cancel_coach_assignment(assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.coach_assignments;
begin
  select * into target
  from public.coach_assignments
  where id = assignment_id
    and coach_id = auth.uid();

  if target.id is null then
    raise exception 'Assignment not found or not authorized';
  end if;

  if target.status = 'completed' then
    raise exception 'Completed assignments cannot be cancelled';
  end if;

  update public.coach_assignments
  set status = 'cancelled'
  where id = assignment_id;

  delete from public.coach_schedule_items
  where assignment_id = cancel_coach_assignment.assignment_id;

  update public.coach_notifications
  set
    read_at = coalesce(read_at, now()),
    dismissed_at = coalesce(dismissed_at, now())
  where assignment_id = cancel_coach_assignment.assignment_id;
end;
$$;

create or replace function public.delete_coach_assignment(assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.coach_assignments;
begin
  select * into target
  from public.coach_assignments
  where id = assignment_id
    and coach_id = auth.uid();

  if target.id is null then
    raise exception 'Assignment not found or not authorized';
  end if;

  if target.status = 'completed' then
    raise exception 'Completed assignments cannot be permanently deleted';
  end if;

  delete from public.coach_notifications
  where assignment_id = delete_coach_assignment.assignment_id;

  delete from public.coach_schedule_items
  where assignment_id = delete_coach_assignment.assignment_id;

  delete from public.coach_assignments
  where id = delete_coach_assignment.assignment_id;
end;
$$;

grant execute on function public.cancel_coach_assignment(uuid) to authenticated;
grant execute on function public.delete_coach_assignment(uuid) to authenticated;

-- Clean up old cancelled assignments that were still visible.
delete from public.coach_schedule_items schedule
using public.coach_assignments assignment
where schedule.assignment_id = assignment.id
  and assignment.status = 'cancelled';

update public.coach_notifications notification
set
  read_at = coalesce(notification.read_at, now()),
  dismissed_at = coalesce(notification.dismissed_at, now())
from public.coach_assignments assignment
where notification.assignment_id = assignment.id
  and assignment.status = 'cancelled';

commit;
