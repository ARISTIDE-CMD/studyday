-- StudyDay - Storage + profile avatar setup
-- Run this in Supabase SQL Editor.

-- 1) Add avatar column to profiles (if missing)
alter table public.profiles
add column if not exists avatar_url text;

-- 2) Ensure buckets exist (public because app uses getPublicUrl)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'images',
    'images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'files',
    'files',
    true,
    20971520,
    array[
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3) Storage RLS policies
-- Path convention enforced by the app:
-- images bucket: avatars/<user_id>/<file>
-- files bucket:  resources/<user_id>/<file>

drop policy if exists "storage_read_images_public" on storage.objects;
drop policy if exists "storage_read_files_public" on storage.objects;
drop policy if exists "storage_insert_images_own" on storage.objects;
drop policy if exists "storage_insert_files_own" on storage.objects;
drop policy if exists "storage_update_images_own" on storage.objects;
drop policy if exists "storage_update_files_own" on storage.objects;
drop policy if exists "storage_delete_images_own" on storage.objects;
drop policy if exists "storage_delete_files_own" on storage.objects;

create policy "storage_read_images_public"
on storage.objects
for select
to public
using (bucket_id = 'images');

create policy "storage_read_files_public"
on storage.objects
for select
to public
using (bucket_id = 'files');

create policy "storage_insert_images_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "storage_insert_files_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'files'
  and (storage.foldername(name))[1] = 'resources'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "storage_update_images_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "storage_update_files_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'files'
  and (storage.foldername(name))[1] = 'resources'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'files'
  and (storage.foldername(name))[1] = 'resources'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "storage_delete_images_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "storage_delete_files_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'files'
  and (storage.foldername(name))[1] = 'resources'
  and (storage.foldername(name))[2] = auth.uid()::text
);
