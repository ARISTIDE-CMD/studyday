-- StudyDay - Supabase RLS + profile bootstrap
-- Run this in Supabase SQL Editor (project database)

-- 1) Utility function for role checks
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 2) Trigger function to auto-create profile on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Recreate trigger safely

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3) Backfill existing users that still have no profile
insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 4) Enable RLS on all app tables
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.resources enable row level security;
alter table public.events enable row level security;
alter table public.announcements enable row level security;

-- 5) Drop old policies to make script re-runnable

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;
drop policy if exists "tasks_delete_own" on public.tasks;

drop policy if exists "resources_select_own" on public.resources;
drop policy if exists "resources_insert_own" on public.resources;
drop policy if exists "resources_update_own" on public.resources;
drop policy if exists "resources_delete_own" on public.resources;

drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;

drop policy if exists "announcements_select_active" on public.announcements;
drop policy if exists "announcements_insert_admin" on public.announcements;
drop policy if exists "announcements_update_admin" on public.announcements;
drop policy if exists "announcements_delete_admin" on public.announcements;

-- 6) PROFILES policies
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- 7) TASKS policies
create policy "tasks_select_own"
on public.tasks
for select
to authenticated
using (user_id = auth.uid());

create policy "tasks_insert_own"
on public.tasks
for insert
to authenticated
with check (user_id = auth.uid());

create policy "tasks_update_own"
on public.tasks
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "tasks_delete_own"
on public.tasks
for delete
to authenticated
using (user_id = auth.uid());

-- 8) RESOURCES policies
create policy "resources_select_own"
on public.resources
for select
to authenticated
using (user_id = auth.uid());

create policy "resources_insert_own"
on public.resources
for insert
to authenticated
with check (user_id = auth.uid());

create policy "resources_update_own"
on public.resources
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "resources_delete_own"
on public.resources
for delete
to authenticated
using (user_id = auth.uid());

-- 9) EVENTS policies (optional analytics/event log)
create policy "events_select_own"
on public.events
for select
to authenticated
using (user_id = auth.uid());

create policy "events_insert_own"
on public.events
for insert
to authenticated
with check (user_id = auth.uid());

-- 10) ANNOUNCEMENTS policies
-- Students can read only active and non-expired announcements.
create policy "announcements_select_active"
on public.announcements
for select
to authenticated
using (
  is_active = true
  and (expires_at is null or expires_at >= now())
);

-- Only admins can manage announcements.
create policy "announcements_insert_admin"
on public.announcements
for insert
to authenticated
with check (public.is_admin());

create policy "announcements_update_admin"
on public.announcements
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "announcements_delete_admin"
on public.announcements
for delete
to authenticated
using (public.is_admin());

-- 11) Basic grants (safe defaults)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.resources to authenticated;
grant select, insert on public.events to authenticated;
grant select on public.announcements to authenticated;

-- End
