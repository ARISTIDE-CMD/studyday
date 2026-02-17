-- Option A: passphrase-based E2EE key backup (cloud restore per user)

create table if not exists public.e2ee_key_backups (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  payload text not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.e2ee_key_backups enable row level security;

drop policy if exists "e2ee_key_backups_select_own" on public.e2ee_key_backups;
create policy "e2ee_key_backups_select_own"
on public.e2ee_key_backups
for select
using (auth.uid() = user_id);

drop policy if exists "e2ee_key_backups_upsert_own" on public.e2ee_key_backups;
create policy "e2ee_key_backups_upsert_own"
on public.e2ee_key_backups
for insert
with check (auth.uid() = user_id);

drop policy if exists "e2ee_key_backups_update_own" on public.e2ee_key_backups;
create policy "e2ee_key_backups_update_own"
on public.e2ee_key_backups
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "e2ee_key_backups_delete_own" on public.e2ee_key_backups;
create policy "e2ee_key_backups_delete_own"
on public.e2ee_key_backups
for delete
using (auth.uid() = user_id);
