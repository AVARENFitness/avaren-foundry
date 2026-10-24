-- Return the current athlete's own plan only, regardless of whether the user
-- also has coach permissions. Do not expose a coach-wide plan query here.
create or replace function public.get_my_quick_plan()
returns table (id uuid, title text, focus text, coach_notes text, exercises jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
 select p.id, p.title, p.focus, p.coach_notes, p.exercises, p.updated_at
 from public.coach_client_quick_plans p
 join public.coach_business_clients b on b.id=p.business_client_id and b.coach_id=p.coach_id
 where b.linked_user_id=auth.uid() and auth.uid() is not null
 order by p.updated_at desc
 limit 1
$$;
revoke all on function public.get_my_quick_plan() from public;
grant execute on function public.get_my_quick_plan() to authenticated;
