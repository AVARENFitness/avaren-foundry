-- Canonical business-client authorization for in-person calendar sessions.
-- Applied to production 2026-10-21 after validating old coach_clients-only RLS
-- blocked legitimate non-app coach_business_clients entries.
drop policy if exists coach_scheduled_sessions_coach_insert on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_insert on public.coach_scheduled_sessions
for insert to authenticated
with check (
 coach_id = (select auth.uid())
 and (select public.is_avaren_coach())
 and business_client_id is not null
 and exists (
  select 1 from public.coach_business_clients bc
  where bc.id = business_client_id
    and bc.coach_id = (select auth.uid())
    and (athlete_id is null or bc.linked_user_id = athlete_id)
 )
);
drop policy if exists coach_scheduled_sessions_coach_update on public.coach_scheduled_sessions;
create policy coach_scheduled_sessions_coach_update on public.coach_scheduled_sessions
for update to authenticated
using (coach_id = (select auth.uid()) and (select public.is_avaren_coach()))
with check (
 coach_id = (select auth.uid())
 and (select public.is_avaren_coach())
 and business_client_id is not null
 and exists (
  select 1 from public.coach_business_clients bc
  where bc.id = business_client_id
    and bc.coach_id = (select auth.uid())
    and (athlete_id is null or bc.linked_user_id = athlete_id)
 )
);
