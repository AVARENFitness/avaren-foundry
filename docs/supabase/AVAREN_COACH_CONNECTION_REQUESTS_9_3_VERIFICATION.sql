-- AVAREN Sprint 9.3 — Self-Serve Coach Connection VERIFICATION
select
  to_regclass('public.coach_connection_requests') is not null as has_request_table,
  to_regprocedure('public.request_avaren_coach_connection(text)') is not null as has_request_rpc,
  to_regprocedure('public.cancel_own_coach_connection_request(uuid)') is not null as has_cancel_rpc,
  to_regprocedure('public.approve_coach_connection_request(uuid,uuid)') is not null as has_approve_rpc,
  to_regprocedure('public.decline_coach_connection_request(uuid)') is not null as has_decline_rpc,
  to_regprocedure('public.create_coach_business_client(text,text,text,text,text,date,text,text)') is not null as has_create_business_client_rpc;

select status, count(*)
from public.coach_connection_requests
group by status
order by status;

-- Expected safety invariant: zero duplicate pending requests per coach/athlete.
select coach_id, athlete_id, count(*)
from public.coach_connection_requests
where status = 'pending'
group by coach_id, athlete_id
having count(*) > 1;

-- Expected safety invariant: at most one business-client record per coach/email.
select coach_id, lower(trim(email)) as email, count(*)
from public.coach_business_clients
where coalesce(trim(email), '') <> ''
group by coach_id, lower(trim(email))
having count(*) > 1;

-- Expected safety invariant: every connected athlete resolves to one canonical business client.
select cc.coach_id, cc.athlete_id, count(*) as business_client_rows
from public.coach_clients cc
group by cc.coach_id, cc.athlete_id
having count(*) > 1;
