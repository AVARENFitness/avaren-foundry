-- AVAREN client liability waiver records
-- Stores durable coach-owned waiver metadata and private signed files for both
-- linked AVAREN athletes and offline business clients.

create table if not exists public.coach_client_documents (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete restrict,
  business_client_id uuid not null references public.coach_business_clients(id) on delete restrict,
  document_type text not null default 'liability_waiver'
    check (document_type in ('liability_waiver')),
  title text not null default 'AVAREN Liability Waiver',
  status text not null default 'signed'
    check (status in ('pending','signed','superseded')),
  document_version text not null default '1',
  storage_path text,
  original_filename text,
  mime_type text,
  signed_at timestamptz,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_client_documents_signed_file_check
    check (
      status <> 'signed'
      or (
        storage_path is not null
        and signed_at is not null
      )
    )
);

alter table public.coach_client_documents
  add column if not exists signing_method text not null default 'upload'
    check (signing_method in ('upload','coach_device')),
  add column if not exists signer_name text,
  add column if not exists waiver_text_snapshot text,
  add column if not exists acknowledgement_text text,
  add column if not exists device_user_agent text;

alter table public.coach_client_documents
  drop constraint if exists coach_client_documents_signed_file_check;

alter table public.coach_client_documents
  add constraint coach_client_documents_signed_file_check
  check (
    status <> 'signed'
    or (
      storage_path is not null
      and signed_at is not null
      and (
        signing_method = 'upload'
        or (
          signing_method = 'coach_device'
          and signer_name is not null
          and waiver_text_snapshot is not null
          and acknowledgement_text is not null
        )
      )
    )
  );

create index if not exists coach_client_documents_business_client_idx
  on public.coach_client_documents (business_client_id, document_type, created_at desc);

create index if not exists coach_client_documents_coach_idx
  on public.coach_client_documents (coach_id, created_at desc);

alter table public.coach_client_documents enable row level security;

drop policy if exists "coach_client_documents_coach_select"
  on public.coach_client_documents;
create policy "coach_client_documents_coach_select"
on public.coach_client_documents
for select
to authenticated
using (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.coach_business_clients c
    where c.id = business_client_id
      and c.coach_id = (select auth.uid())
  )
);

drop policy if exists "coach_client_documents_coach_insert"
  on public.coach_client_documents;
create policy "coach_client_documents_coach_insert"
on public.coach_client_documents
for insert
to authenticated
with check (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.coach_business_clients c
    where c.id = business_client_id
      and c.coach_id = (select auth.uid())
  )
);

drop policy if exists "coach_client_documents_coach_update"
  on public.coach_client_documents;
create policy "coach_client_documents_coach_update"
on public.coach_client_documents
for update
to authenticated
using (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.coach_business_clients c
    where c.id = business_client_id
      and c.coach_id = (select auth.uid())
  )
)
with check (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.coach_business_clients c
    where c.id = business_client_id
      and c.coach_id = (select auth.uid())
  )
);

grant select, insert, update on public.coach_client_documents to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'client-waivers',
  'client-waivers',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "client_waivers_coach_select" on storage.objects;
create policy "client_waivers_coach_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-waivers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.coach_business_clients c
    where c.coach_id = (select auth.uid())
      and c.id::text = (storage.foldername(name))[2]
  )
);

drop policy if exists "client_waivers_coach_insert" on storage.objects;
create policy "client_waivers_coach_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-waivers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.coach_business_clients c
    where c.coach_id = (select auth.uid())
      and c.id::text = (storage.foldername(name))[2]
  )
);

drop policy if exists "client_waivers_coach_update" on storage.objects;
create policy "client_waivers_coach_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'client-waivers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.coach_business_clients c
    where c.coach_id = (select auth.uid())
      and c.id::text = (storage.foldername(name))[2]
  )
)
with check (
  bucket_id = 'client-waivers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.coach_business_clients c
    where c.coach_id = (select auth.uid())
      and c.id::text = (storage.foldername(name))[2]
  )
);

-- Delete is intentionally limited to the same owning coach and exists only
-- for upload rollback/cleanup. The app does not expose destructive waiver deletion.
drop policy if exists "client_waivers_coach_delete" on storage.objects;
create policy "client_waivers_coach_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'client-waivers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.coach_business_clients c
    where c.coach_id = (select auth.uid())
      and c.id::text = (storage.foldername(name))[2]
  )
);
