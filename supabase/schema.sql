-- StudyDeck progress sync: database setup for Supabase.
--
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again.
--
-- Each signed-in user has exactly one row holding their whole progress (the same data as
-- "Export progress" on the Stats page). The app merges devices together itself; `rev` goes up
-- by one on every save so two devices saving at the same moment can't overwrite each other.

create table if not exists public.progress (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  rev        integer not null default 1,
  updated_at timestamptz not null default now(),
  -- Keep rows a sensible size (a student with 20,000 cards is well under 5 MB).
  constraint progress_size check (octet_length(data::text) < 5000000)
);

-- Row Level Security: people can only ever see and change their own row.
alter table public.progress enable row level security;

drop policy if exists "Read own progress" on public.progress;
create policy "Read own progress" on public.progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Create own progress" on public.progress;
create policy "Create own progress" on public.progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Update own progress" on public.progress;
create policy "Update own progress" on public.progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Delete own progress" on public.progress;
create policy "Delete own progress" on public.progress
  for delete to authenticated using (user_id = auth.uid());

-- Signed-out visitors get nothing at all.
revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;

-- The server sets the save time, not the browser.
create or replace function public.progress_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before insert or update on public.progress
  for each row execute function public.progress_touch();

-- "Delete my account" on the Stats page calls this. It removes the signed-in user's account
-- (email address) and, through "on delete cascade" above, their saved progress.
-- It runs with the database owner's rights (security definer) but can only ever delete the
-- account of whoever is calling it.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
