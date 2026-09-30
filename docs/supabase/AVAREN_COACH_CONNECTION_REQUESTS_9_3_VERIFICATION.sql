-- AVAREN Sprint 9.3 — Self-Serve Coach Connection VERIFICATION
select
  to_regclass('public.coach_connection_requests') is not null as has_request_table,
  to_regprocedure('public.request_avaren_coach_connection(text)') is not null as has_request_rpc,
  to_regprocedure('public.cancel_own_coach_connection_request(uuid)') is not null as has_cancel_rpc,
  to_regprocedure('public.approve_coach_connection_request(uuid,uuid)') is not null as has_approve_rpc,
  to_regprocedure('public.decline_coach_connection_request(uuid)') is not null as has_decline_rpc;

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
