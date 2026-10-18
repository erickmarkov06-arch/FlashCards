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

-- ---------- usernames and the leaderboard ----------

-- One row per user who has chosen a username. Usernames are public on the leaderboard, so they
-- are limited to letters, numbers and _ (no spaces). Capitals are allowed ("MathsFox"), but
-- names are unique ignoring case, so "mathsfox" can't be taken by someone else.
-- Nobody appears on the leaderboard unless they switch it on (on_leaderboard).
create table if not exists public.profiles (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username       text not null,
  on_leaderboard boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$');
drop index if exists public.profiles_username_key; -- the old, case-sensitive version
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Delete own profile" on public.profiles;
create policy "Delete own profile" on public.profiles
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

-- The leaderboard: username and three numbers per person, worked out from their saved progress.
-- Only people who switched on_leaderboard on are included (plus yourself, so you can see where
-- you'd be). Only signed-in users can call it. Nothing else about anyone is returned.
create or replace function public.leaderboard()
returns table (username text, answers_week integer, streak integer, mastered integer, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with people as (
    select pr.user_id, pr.username,
           coalesce(p.data -> 'progress', '{}'::jsonb) as progress,
           coalesce(p.data -> 'activity', '{}'::jsonb) as activity
    from public.profiles pr
    left join public.progress p on p.user_id = pr.user_id
    where pr.on_leaderboard or pr.user_id = auth.uid()
  ),
  days as (
    select people.user_id, a.key::date as day
    from people, jsonb_each_text(people.activity) a
    where a.key ~ '^\d{4}-\d{2}-\d{2}$' and a.value ~ '^\d+$' and a.value::int > 0
  )
  select
    people.username,
    (select coalesce(sum(a.value::int), 0)::int
       from jsonb_each_text(people.activity) a
      where a.key ~ '^\d{4}-\d{2}-\d{2}$' and a.value ~ '^\d+$'
        and a.key >= to_char(current_date - 6, 'YYYY-MM-DD')) as answers_week,
    -- Days in a row with answers, ending today (or yesterday, if not studied yet today).
    (select coalesce(min(g), 0)::int
       from generate_series(0, 3660) g,
            (select case when exists (select 1 from days d where d.user_id = people.user_id and d.day = current_date)
                         then current_date else current_date - 1 end as start) s
      where not exists (select 1 from days d where d.user_id = people.user_id and d.day = s.start - g)) as streak,
    (select count(*)::int
       from jsonb_each(people.progress) e
      where right(e.key, 2) <> '~r' and (e.value ->> 'box') ~ '^\d+$' and (e.value ->> 'box')::int >= 5) as mastered,
    people.user_id = auth.uid() as is_me
  from people;
$$;

revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;

notify pgrst, 'reload schema';
