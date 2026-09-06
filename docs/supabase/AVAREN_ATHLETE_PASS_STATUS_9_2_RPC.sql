-- AVAREN — Athlete pass summary scope (Home / Schedule visibility)
-- Minimal owner-scoped RPC patch. Run only after review.
--
-- Why:
-- 1) Exclude archived/paused business clients from athlete-facing pass status.
-- 2) Return business_client_id so multiple active coaching relationships
--    are not silently merged in the client.
--
-- Does not change coach ledger semantics, debit RPCs, or table RLS.

begin;

create or replace function public.get_my_training_pass_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_result jsonb := '[]'::jsonb;
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(row order by row->>'starts_at' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'pass_id', p.id,
      'business_client_id', bc.id,
      'name', p.name,
      'balance', coalesce(b.balance, 0),
      'starts_at', p.starts_at,
      'expires_at', p.expires_at,
      'status', p.status
    ) as row
    from public.coach_business_clients as bc
    join public.coach_client_passes as p on p.business_client_id = bc.id
    left join public.coach_client_pass_balances as b on b.pass_id = p.id
    where bc.linked_user_id = v_athlete_id
      and bc.status = 'active'
      and p.status = 'active'
  ) as q;

  return v_result;
end;
$$;

revoke all on function public.get_my_training_pass_summary() from public, anon, authenticated;
grant execute on function public.get_my_training_pass_summary() to authenticated;

create or replace function public.list_my_pass_usage_history(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_athlete_id is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'occurred_at', scoped.created_at,
          'entry_type', scoped.entry_type,
          'quantity', scoped.quantity,
          'pass_name', scoped.pass_name,
          'business_client_id', scoped.business_client_id
        )
        order by scoped.created_at desc
      )
      from (
        select
          l.created_at,
          l.entry_type,
          l.quantity,
          p.name as pass_name,
          l.business_client_id
        from public.coach_client_pass_ledger as l
        join public.coach_client_passes as p on p.id = l.pass_id
        join public.coach_business_clients as bc on bc.id = l.business_client_id
        where bc.linked_user_id = v_athlete_id
          and bc.status = 'active'
          and l.entry_type in (
            'session_used', 'no_show_charged', 'purchase', 'bonus', 'credit_restored'
          )
        order by l.created_at desc
        limit v_limit
      ) as scoped
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_my_pass_usage_history(integer) from public, anon, authenticated;
grant execute on function public.list_my_pass_usage_history(integer) to authenticated;

commit;
