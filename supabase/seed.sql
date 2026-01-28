-- Basic tournaments table for Matchamp using Supabase Postgres
-- This is applied in local dev via `supabase db reset` (see config.toml).

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  tournament_type text not null default 'single_elimination' check (tournament_type in ('swiss', 'single_elimination')),
  num_rounds integer,
  created_at timestamptz not null default now()
);

-- Enable row level security for tournaments
alter table public.tournaments enable row level security;

-- Allow users to insert tournaments they own
drop policy if exists "tournaments_insert_own" on public.tournaments;
create policy "tournaments_insert_own"
on public.tournaments
for insert
with check ((select auth.uid()) = created_by);

-- Allow users to read only their tournaments
drop policy if exists "tournaments_select_own" on public.tournaments;
create policy "tournaments_select_own"
on public.tournaments
for select
using ((select auth.uid()) = created_by);

-- Allow users to update only their tournaments
drop policy if exists "tournaments_update_own" on public.tournaments;
create policy "tournaments_update_own"
on public.tournaments
for update
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

-- Allow users to delete only their tournaments
drop policy if exists "tournaments_delete_own" on public.tournaments;
create policy "tournaments_delete_own"
on public.tournaments
for delete
using ((select auth.uid()) = created_by);

-- Basic players table, scoped to a tournament and owner
create table if not exists public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.tournament_players enable row level security;

-- Users can manage only players they created
drop policy if exists "tournament_players_insert_own" on public.tournament_players;
create policy "tournament_players_insert_own"
on public.tournament_players
for insert
with check ((select auth.uid()) = created_by);

drop policy if exists "tournament_players_select_own" on public.tournament_players;
create policy "tournament_players_select_own"
on public.tournament_players
for select
using ((select auth.uid()) = created_by);

drop policy if exists "tournament_players_update_own" on public.tournament_players;
create policy "tournament_players_update_own"
on public.tournament_players
for update
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

drop policy if exists "tournament_players_delete_own" on public.tournament_players;
create policy "tournament_players_delete_own"
on public.tournament_players
for delete
using (
  (select auth.uid()) = created_by
  and exists (
    select 1
    from public.tournaments t
    where t.id = tournament_players.tournament_id
      and t.status = 'draft'
  )
);

