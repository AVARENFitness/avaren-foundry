-- One editable quick plan per coach business client; no revision is lost on print.
create table if not exists public.coach_client_quick_plans (
 id uuid primary key default gen_random_uuid(),
 coach_id uuid not null references auth.users(id),
 business_client_id uuid not null references public.coach_business_clients(id) on delete cascade,
 title text not null default 'Training plan',
 focus text not null default '',
 coach_notes text not null default '',
 exercises jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint coach_quick_plans_owner_unique unique (coach_id,business_client_id),
 constraint coach_quick_plans_exercises_array check (jsonb_typeof(exercises) = 'array'),
 constraint coach_quick_plans_title_length check (char_length(title) between 1 and 120)
);
alter table public.coach_client_quick_plans enable row level security;
create policy coach_quick_plans_select on public.coach_client_quick_plans
for select to authenticated using (
 coach_id = auth.uid() and public.is_avaren_coach()
 and exists (select 1 from public.coach_business_clients b where b.id=business_client_id and b.coach_id=auth.uid())
);
create policy coach_quick_plans_insert on public.coach_client_quick_plans
for insert to authenticated with check (
 coach_id = auth.uid() and public.is_avaren_coach()
 and exists (select 1 from public.coach_business_clients b where b.id=business_client_id and b.coach_id=auth.uid())
);
create policy coach_quick_plans_update on public.coach_client_quick_plans
for update to authenticated using (
 coach_id = auth.uid() and public.is_avaren_coach()
) with check (
 coach_id = auth.uid() and public.is_avaren_coach()
 and exists (select 1 from public.coach_business_clients b where b.id=business_client_id and b.coach_id=auth.uid())
);
create policy athlete_quick_plans_select on public.coach_client_quick_plans
for select to authenticated using (
 exists (select 1 from public.coach_business_clients b
 where b.id=business_client_id and b.coach_id=coach_id and b.linked_user_id=auth.uid())
);
create index if not exists coach_quick_plans_client_idx on public.coach_client_quick_plans (business_client_id);
