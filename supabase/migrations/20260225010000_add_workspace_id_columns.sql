-- ============================================================
-- Migration: Add workspace_id (nullable) to all tenant-owned
-- tables, and add public_slug to tournaments.
--
-- Nullable at this stage — Migration C backfills existing rows,
-- then Migration D makes the columns NOT NULL.
-- ============================================================

ALTER TABLE public.tournaments
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN public_slug  TEXT UNIQUE DEFAULT gen_random_uuid()::text;

ALTER TABLE public.tournament_players
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_matches
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_standings
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
