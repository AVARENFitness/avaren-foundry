-- AVAREN Sprint 9.3 — Self-Serve Coach Connection PRECHECK
select
  to_regclass('public.coach_business_clients') is not null as has_business_clients,
  to_regclass('public.coach_clients') is not null as has_coach_clients,
  to_regclass('public.coach_invitations') is not null as has_invitations,
  to_regclass('public.coach_allowlist') is not null as has_allowlist,
  to_regprocedure('public.is_avaren_coach()') is not null as has_is_avaren_coach,
  to_regprocedure('public.coach_local_business_date(text)') is not null as has_local_date_helper;

select
  count(*) filter (where lower(email) = 'hello@avarenfitness.com') as owner_allowlist_rows
from public.coach_allowlist;
