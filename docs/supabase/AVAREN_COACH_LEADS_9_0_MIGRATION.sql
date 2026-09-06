-- AVAREN Sprint 9.0.1 — Coach Leads (lightweight CRM)
-- Idempotent: safe to run multiple times.
--
-- Depends on:
--   • auth.users
--   • public.coach_business_clients
--   • public.create_coach_business_client(...)
--   • public.is_avaren_coach()
--   • public.touch_updated_at()

begin;

do $$
begin
  if to_regclass('public.coach_business_clients') is null then
    raise exception 'Missing dependency: public.coach_business_clients';
  end if;

  if to_regprocedure('public.create_coach_business_client(text,text,text,text,text,date,text,text)') is null then
    raise exception 'Missing dependency: public.create_coach_business_client(...). Run AVAREN_COACH_BUSINESS_CLIENTS_8_5_PHASE_C_MIGRATION.sql first.';
  end if;

  if to_regprocedure('public.is_avaren_coach()') is null then
    raise exception 'Missing dependency: public.is_avaren_coach(). Run AVAREN_COACH_BACKEND.sql first.';
  end if;

  if to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'Missing dependency: public.touch_updated_at(). Run AVAREN_COACH_CLIENT_IDENTITY_7_9_3.sql first.';
  end if;
end $$;

create table if not exists public.coach_leads (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) > 0),
  last_name text not null default '' check (char_length(last_name) <= 80),
  preferred_name text not null default '' check (char_length(preferred_name) <= 80),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 160),
  goal text not null default '' check (char_length(goal) <= 280),
  source text not null default '' check (char_length(source) <= 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  stage text not null default 'NEW'
    check (stage in (
      'NEW',
      'CONTACTED',
      'CONSULTATION_SCHEDULED',
      'TRIAL_COMPLETED',
      'WON',
      'LOST'
    )),
  next_follow_up_at timestamptz,
  business_client_id uuid references public.coach_business_clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_leads_coach_id_idx
  on public.coach_leads (coach_id, updated_at desc);

create index if not exists coach_leads_follow_up_idx
  on public.coach_leads (coach_id, next_follow_up_at)
  where next_follow_up_at is not null
    and stage not in ('WON', 'LOST');

alter table public.coach_leads enable row level security;

revoke all on table public.coach_leads from public, anon;
grant select, insert, update on table public.coach_leads to authenticated;

drop policy if exists coach_leads_coach on public.coach_leads;
drop policy if exists coach_leads_select on public.coach_leads;
drop policy if exists coach_leads_insert on public.coach_leads;
drop policy if exists coach_leads_update on public.coach_leads;

create policy coach_leads_select on public.coach_leads
for select to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach());

create policy coach_leads_insert on public.coach_leads
for insert to authenticated
with check (coach_id = auth.uid() and public.is_avaren_coach());

create policy coach_leads_update on public.coach_leads
for update to authenticated
using (coach_id = auth.uid() and public.is_avaren_coach())
with check (coach_id = auth.uid() and public.is_avaren_coach());

drop trigger if exists coach_leads_touch_updated_at on public.coach_leads;
create trigger coach_leads_touch_updated_at
before update on public.coach_leads
for each row
execute function public.touch_updated_at();

create or replace function public.convert_coach_lead_to_business_client(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_lead public.coach_leads%rowtype;
  v_client public.coach_business_clients%rowtype;
  v_note text;
  v_create jsonb;
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_avaren_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_lead
  from public.coach_leads
  where id = p_lead_id
    and coach_id = v_coach_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_lead.business_client_id is not null then
    select *
    into v_client
    from public.coach_business_clients
    where id = v_lead.business_client_id
      and coach_id = v_coach_id;

    return jsonb_build_object(
      'lead', to_jsonb(v_lead),
      'business_client', to_jsonb(v_client)
    );
  end if;

  if v_lead.stage <> 'WON' then
    raise exception 'lead_not_won';
  end if;

  v_note := trim(
    concat_ws(
      E'\n',
      nullif(trim(v_lead.goal), ''),
      case when trim(v_lead.source) <> '' then 'Source: ' || trim(v_lead.source) else null end,
      nullif(trim(v_lead.notes), '')
    )
  );

  v_create := public.create_coach_business_client(
    v_lead.first_name,
    v_lead.last_name,
    coalesce(v_lead.preferred_name, ''),
    nullif(trim(v_lead.email), ''),
    nullif(trim(v_lead.phone), ''),
    current_date,
    v_note,
    'America/New_York'
  );

  select *
  into v_client
  from public.coach_business_clients
  where id = (v_create ->> 'business_client_id')::uuid
    and coach_id = v_coach_id;

  if not found then
    raise exception 'client_create_failed';
  end if;

  update public.coach_leads
  set
    business_client_id = v_client.id,
    updated_at = now()
  where id = v_lead.id
  returning *
  into v_lead;

  return jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'business_client', to_jsonb(v_client)
  );
end;
$$;

revoke all on function public.convert_coach_lead_to_business_client(uuid) from public;
grant execute on function public.convert_coach_lead_to_business_client(uuid) to authenticated;

commit;
