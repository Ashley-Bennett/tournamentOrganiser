-- Basic tournaments table for Matchamp using Supabase Postgres
-- This is applied in local dev via `supabase db reset` (see config.toml).

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
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

