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

-- Matches table for tournament matches
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_number integer not null,
  player1_id uuid not null references public.tournament_players (id) on delete cascade,
  player2_id uuid references public.tournament_players (id) on delete set null,
  winner_id uuid references public.tournament_players (id) on delete set null,
  result text, -- e.g., "2-0", "2-1", "bye"
  status text not null default 'ready' check (status in ('ready', 'pending', 'completed', 'bye')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_matches enable row level security;

-- Users can manage matches for tournaments they own
drop policy if exists "tournament_matches_select_own" on public.tournament_matches;
create policy "tournament_matches_select_own"
on public.tournament_matches
for select
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_matches.tournament_id
      and t.created_by = (select auth.uid())
  )
);

drop policy if exists "tournament_matches_insert_own" on public.tournament_matches;
create policy "tournament_matches_insert_own"
on public.tournament_matches
for insert
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_matches.tournament_id
      and t.created_by = (select auth.uid())
  )
);

drop policy if exists "tournament_matches_update_own" on public.tournament_matches;
create policy "tournament_matches_update_own"
on public.tournament_matches
for update
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_matches.tournament_id
      and t.created_by = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_matches.tournament_id
      and t.created_by = (select auth.uid())
  )
);

drop policy if exists "tournament_matches_delete_own" on public.tournament_matches;
create policy "tournament_matches_delete_own"
on public.tournament_matches
for delete
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_matches.tournament_id
      and t.created_by = (select auth.uid())
  )
);
