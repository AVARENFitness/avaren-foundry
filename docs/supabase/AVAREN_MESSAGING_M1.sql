create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz null,
  unique (coach_id, athlete_id)
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.coach_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists coach_messages_conversation_created_idx
  on public.coach_messages (conversation_id, created_at);

alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;

create or replace function public.is_active_coaching_relationship(
  p_coach_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_clients cc
    left join public.coach_business_clients bc
      on bc.id = cc.business_client_id
    where cc.coach_id = p_coach_id
      and cc.athlete_id = p_athlete_id
      and (
        cc.business_client_id is null
        or bc.status = 'active'
      )
  );
$$;

drop policy if exists coach_conversations_participant_read on public.coach_conversations;
create policy coach_conversations_participant_read
on public.coach_conversations
for select
using (
  auth.uid() = coach_id
  or auth.uid() = athlete_id
);

drop policy if exists coach_messages_participant_read on public.coach_messages;
create policy coach_messages_participant_read
on public.coach_messages
for select
using (
  exists (
    select 1
    from public.coach_conversations c
    where c.id = coach_messages.conversation_id
      and (auth.uid() = c.coach_id or auth.uid() = c.athlete_id)
  )
);

drop policy if exists coach_messages_active_relationship_insert on public.coach_messages;
create policy coach_messages_active_relationship_insert
on public.coach_messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.coach_conversations c
    where c.id = coach_messages.conversation_id
      and (auth.uid() = c.coach_id or auth.uid() = c.athlete_id)
      and public.is_active_coaching_relationship(c.coach_id, c.athlete_id)
  )
);

drop policy if exists coach_messages_recipient_update on public.coach_messages;
create policy coach_messages_recipient_update
on public.coach_messages
for update
using (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.coach_conversations c
    where c.id = coach_messages.conversation_id
      and (auth.uid() = c.coach_id or auth.uid() = c.athlete_id)
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.coach_conversations c
    where c.id = coach_messages.conversation_id
      and (auth.uid() = c.coach_id or auth.uid() = c.athlete_id)
  )
);

create or replace function public.touch_coach_conversation_from_message()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.coach_conversations
  set
    updated_at = now(),
    last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists coach_messages_touch_conversation on public.coach_messages;
create trigger coach_messages_touch_conversation
after insert on public.coach_messages
for each row execute function public.touch_coach_conversation_from_message();

create or replace function public.get_or_create_coach_conversation(
  p_other_user_id uuid
)
returns public.coach_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_athlete_id uuid;
  v_conversation public.coach_conversations;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'invalid_message_recipient';
  end if;

  select cc.coach_id, cc.athlete_id
  into v_coach_id, v_athlete_id
  from public.coach_clients cc
  left join public.coach_business_clients bc
    on bc.id = cc.business_client_id
  where (
      (cc.coach_id = v_user_id and cc.athlete_id = p_other_user_id)
      or
      (cc.athlete_id = v_user_id and cc.coach_id = p_other_user_id)
    )
    and (
      cc.business_client_id is null
      or bc.status = 'active'
    )
  order by cc.created_at desc
  limit 1;

  if v_coach_id is null or v_athlete_id is null then
    raise exception 'active_coaching_relationship_required';
  end if;

  insert into public.coach_conversations (
    coach_id,
    athlete_id
  )
  values (
    v_coach_id,
    v_athlete_id
  )
  on conflict (coach_id, athlete_id)
  do update set updated_at = public.coach_conversations.updated_at
  returning * into v_conversation;

  return v_conversation;
end;
$$;

revoke all on function public.get_or_create_coach_conversation(uuid) from public;
grant execute on function public.get_or_create_coach_conversation(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coach_messages'
  ) then
    alter publication supabase_realtime add table public.coach_messages;
  end if;
end $$;

comment on table public.coach_conversations is
  'One durable coach-athlete messaging thread per coaching relationship.';
comment on table public.coach_messages is
  'Durable 1:1 coaching messages. History remains readable after coaching ends; new sends require an active relationship.';


-- M1 hardening: read receipts use a narrow RPC instead of generic message UPDATE.
drop policy if exists coach_messages_recipient_update on public.coach_messages;

create or replace function public.mark_coach_conversation_read(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.coach_conversations c
    where c.id = p_conversation_id
      and (c.coach_id = v_user_id or c.athlete_id = v_user_id)
  ) then
    raise exception 'conversation_not_available';
  end if;

  update public.coach_messages
  set read_at = coalesce(read_at, now())
  where conversation_id = p_conversation_id
    and sender_id <> v_user_id
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_coach_conversation_read(uuid) from public;
grant execute on function public.mark_coach_conversation_read(uuid) to authenticated;

create or replace function public.touch_coach_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_conversations
  set
    updated_at = now(),
    last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.touch_coach_conversation_from_message() from public;


-- M1 hardening: active relationship check may inspect coach-private business status.
create or replace function public.is_active_coaching_relationship(
  p_coach_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_clients cc
    left join public.coach_business_clients bc
      on bc.id = cc.business_client_id
    where cc.coach_id = p_coach_id
      and cc.athlete_id = p_athlete_id
      and (
        cc.business_client_id is null
        or bc.status = 'active'
      )
  );
$$;

revoke all on function public.is_active_coaching_relationship(uuid, uuid) from public;
grant execute on function public.is_active_coaching_relationship(uuid, uuid) to authenticated;


-- M1 lifecycle hardening: existing conversation history remains readable after coaching ends.
create or replace function public.get_or_create_coach_conversation(
  p_other_user_id uuid
)
returns public.coach_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_athlete_id uuid;
  v_conversation public.coach_conversations;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'invalid_message_recipient';
  end if;

  select c.*
  into v_conversation
  from public.coach_conversations c
  where (
    (c.coach_id = v_user_id and c.athlete_id = p_other_user_id)
    or
    (c.athlete_id = v_user_id and c.coach_id = p_other_user_id)
  )
  order by c.created_at desc
  limit 1;

  if v_conversation.id is not null then
    return v_conversation;
  end if;

  select cc.coach_id, cc.athlete_id
  into v_coach_id, v_athlete_id
  from public.coach_clients cc
  left join public.coach_business_clients bc
    on bc.id = cc.business_client_id
  where (
      (cc.coach_id = v_user_id and cc.athlete_id = p_other_user_id)
      or
      (cc.athlete_id = v_user_id and cc.coach_id = p_other_user_id)
    )
    and (
      cc.business_client_id is null
      or bc.status = 'active'
    )
  order by cc.created_at desc
  limit 1;

  if v_coach_id is null or v_athlete_id is null then
    raise exception 'active_coaching_relationship_required';
  end if;

  insert into public.coach_conversations (
    coach_id,
    athlete_id
  )
  values (
    v_coach_id,
    v_athlete_id
  )
  on conflict (coach_id, athlete_id)
  do update set updated_at = public.coach_conversations.updated_at
  returning * into v_conversation;

  return v_conversation;
end;
$$;

revoke all on function public.get_or_create_coach_conversation(uuid) from public;
grant execute on function public.get_or_create_coach_conversation(uuid) to authenticated;
