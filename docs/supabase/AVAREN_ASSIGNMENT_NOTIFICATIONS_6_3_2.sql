-- AVAREN Sprint 6.3.2 — Assignment Notifications
-- Run once in Supabase SQL Editor after the 6.2 and 6.3 migrations.

begin;

create table if not exists public.coach_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  assignment_id uuid references public.coach_assignments(id) on delete cascade,
  type text not null check (type in ('assignment-created','assignment-due','assignment-overdue','assignment-completed','coach-comment')),
  title text not null,
  body text not null default '',
  action text not null default 'none',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists coach_notifications_recipient_created_idx
  on public.coach_notifications (recipient_id, created_at desc);
create index if not exists coach_notifications_assignment_idx
  on public.coach_notifications (assignment_id);

alter table public.coach_notifications enable row level security;

drop policy if exists coach_notifications_recipient_select on public.coach_notifications;
create policy coach_notifications_recipient_select
on public.coach_notifications for select to authenticated
using (recipient_id = auth.uid() or actor_id = auth.uid());

drop policy if exists coach_notifications_recipient_update on public.coach_notifications;
create policy coach_notifications_recipient_update
on public.coach_notifications for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists coach_notifications_system_insert on public.coach_notifications;
create policy coach_notifications_system_insert
on public.coach_notifications for insert to authenticated
with check (
  actor_id = auth.uid()
  and public.is_avaren_coach()
);

create or replace function public.create_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coach_notifications (
    recipient_id,
    actor_id,
    assignment_id,
    type,
    title,
    body,
    action,
    payload
  ) values (
    new.athlete_id,
    new.coach_id,
    new.id,
    'assignment-created',
    'New workout assigned',
    concat(
      new.title,
      case when new.due_date is not null
        then concat(' · Due ', to_char(new.due_date, 'Mon DD'))
        else ''
      end
    ),
    'open-assignment',
    jsonb_build_object(
      'assignmentId', new.id,
      'title', new.title,
      'dueDate', new.due_date,
      'priority', coalesce(new.priority, 'normal')
    )
  );
  return new;
end;
$$;

drop trigger if exists coach_assignment_notification_trigger on public.coach_assignments;
create trigger coach_assignment_notification_trigger
after insert on public.coach_assignments
for each row execute function public.create_assignment_notification();

create or replace function public.create_assignment_completion_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.coach_notifications (
      recipient_id,
      actor_id,
      assignment_id,
      type,
      title,
      body,
      action,
      payload
    ) values (
      new.coach_id,
      new.athlete_id,
      new.id,
      'assignment-completed',
      'Assigned workout completed',
      new.title,
      'open-coach-assignment',
      jsonb_build_object(
        'assignmentId', new.id,
        'title', new.title,
        'athleteId', new.athlete_id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists coach_assignment_completion_notification_trigger on public.coach_assignments;
create trigger coach_assignment_completion_notification_trigger
after update of status on public.coach_assignments
for each row execute function public.create_assignment_completion_notification();

-- Add this table to Supabase Realtime once. The exception handler makes reruns safe.
do $$
begin
  alter publication supabase_realtime add table public.coach_notifications;
exception
  when duplicate_object then null;
end $$;

commit;
