-- AVAREN 8.7.6 — list_coach_business_clients coaching_requirements patch
-- STOP: review and approve before running in Supabase.
--
-- Root cause: list_coach_business_clients() returns a hand-built column list that
-- omits coaching_requirements. Frontend enrichment covers this until approved.
--
-- After this patch, roster RPC responses include persisted requirements directly.

create or replace function public.list_coach_business_clients(
  p_include_archived boolean default false
)
returns table (
  business_client_id uuid,
  coach_id uuid,
  linked_user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  display_name text,
  email text,
  phone text,
  status text,
  started_at date,
  ended_at date,
  created_at timestamptz,
  coaching_requirements jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    bc.id,
    bc.coach_id,
    bc.linked_user_id,
    bc.first_name,
    bc.last_name,
    bc.preferred_name,
    bc.display_name,
    bc.email,
    bc.phone,
    bc.status,
    bc.started_at,
    bc.ended_at,
    bc.created_at,
    bc.coaching_requirements
  from public.coach_business_clients as bc
  where bc.coach_id = auth.uid()
    and public.is_avaren_coach()
    and (p_include_archived or bc.status = 'active')
  order by bc.status asc, bc.display_name asc, bc.created_at desc;
$$;

revoke all on function public.list_coach_business_clients(boolean)
  from public, anon, authenticated;
grant execute on function public.list_coach_business_clients(boolean)
  to authenticated;
