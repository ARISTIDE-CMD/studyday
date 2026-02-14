-- StudyDay - Tasks archive retention + persistent flag
-- Run this in Supabase SQL Editor (project database)

alter table public.tasks
  add column if not exists completed_at timestamp with time zone;

alter table public.tasks
  add column if not exists is_persistent boolean not null default false;

-- Backfill existing completed tasks so retention can work immediately.
update public.tasks
set completed_at = coalesce(completed_at, created_at)
where status = 'done'
  and completed_at is null;

create index if not exists tasks_archive_cleanup_idx
  on public.tasks (user_id, status, is_persistent, completed_at);

comment on column public.tasks.completed_at is
  'Timestamp when task was marked done (used for archive retention).';

comment on column public.tasks.is_persistent is
  'If true, archived task is kept and excluded from 24h auto-delete.';
