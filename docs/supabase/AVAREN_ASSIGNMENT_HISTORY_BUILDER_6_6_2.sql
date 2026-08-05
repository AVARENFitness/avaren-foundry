-- AVAREN Sprint 6.6.2
-- Cancelled assignment deletion and lifecycle function correction

begin;

drop function if exists public.cancel_coach_assignment(uuid);
drop function if exists public.delete_coach_assignment(uuid);

create function public.cancel_coach_assignment(assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  select ca.status into current_status
  from public.coach_assignments as ca
  where ca.id = $1 and ca.coach_id = auth.uid();

  if current_status is null then
    raise exception 'Assignment not found or not authorized';
  end if;
  if current_status = 'completed' then
    raise exception 'Completed assignments cannot be cancelled';
  end if;

  update public.coach_assignments as ca
  set status = 'cancelled'
  where ca.id = $1 and ca.coach_id = auth.uid();

  delete from public.coach_schedule_items as csi
  where csi.assignment_id = $1;

  update public.coach_notifications as cn
  set read_at = coalesce(cn.read_at, now()),
      dismissed_at = coalesce(cn.dismissed_at, now())
  where cn.assignment_id = $1;
end;
$$;

create function public.delete_coach_assignment(assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  select ca.status into current_status
  from public.coach_assignments as ca
  where ca.id = $1 and ca.coach_id = auth.uid();

  if current_status is null then
    raise exception 'Assignment not found or not authorized';
  end if;
  if current_status = 'completed' then
    raise exception 'Completed assignments cannot be permanently deleted';
  end if;

  delete from public.coach_notifications as cn
  where cn.assignment_id = $1;

  delete from public.coach_schedule_items as csi
  where csi.assignment_id = $1;

  delete from public.coach_assignments as ca
  where ca.id = $1 and ca.coach_id = auth.uid();
end;
$$;

grant execute on function public.cancel_coach_assignment(uuid) to authenticated;
grant execute on function public.delete_coach_assignment(uuid) to authenticated;

commit;
