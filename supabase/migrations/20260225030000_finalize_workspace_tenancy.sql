-- ============================================================
-- Migration: Finalize workspace tenancy
--   1. Make workspace_id NOT NULL everywhere
--   2. Add performance indexes
--   3. Replace created_by–based RLS policies with
--      workspace-membership–based policies
-- ============================================================

-- ---- 1. Enforce NOT NULL --------------------------------

ALTER TABLE public.tournaments       ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tournament_players ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tournament_matches ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tournament_standings ALTER COLUMN workspace_id SET NOT NULL;

-- ---- 2. Indexes -----------------------------------------

CREATE INDEX IF NOT EXISTS idx_tournaments_workspace
  ON public.tournaments (workspace_id);

CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_workspace
  ON public.tournament_players (tournament_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_workspace
  ON public.tournament_matches (tournament_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_tournament_standings_tournament_workspace
  ON public.tournament_standings (tournament_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_workspace
  ON public.workspace_memberships (user_id, workspace_id);

-- ---- 3. Drop old created_by–based RLS policies ----------

-- tournaments
DROP POLICY IF EXISTS "tournaments_select_own"  ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_insert_own"  ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update_own"  ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete_own"  ON public.tournaments;
-- The is_public SELECT policy is superseded by the merged policy below
DROP POLICY IF EXISTS "tournaments_select_public" ON public.tournaments;

-- tournament_players
DROP POLICY IF EXISTS "tournament_players_select_own"  ON public.tournament_players;
DROP POLICY IF EXISTS "tournament_players_insert_own"  ON public.tournament_players;
DROP POLICY IF EXISTS "tournament_players_update_own"  ON public.tournament_players;
DROP POLICY IF EXISTS "tournament_players_delete_own"  ON public.tournament_players;

-- tournament_matches
DROP POLICY IF EXISTS "tournament_matches_select_own"  ON public.tournament_matches;
DROP POLICY IF EXISTS "tournament_matches_insert_own"  ON public.tournament_matches;
DROP POLICY IF EXISTS "tournament_matches_update_own"  ON public.tournament_matches;
DROP POLICY IF EXISTS "tournament_matches_delete_own"  ON public.tournament_matches;

-- tournament_standings
DROP POLICY IF EXISTS "tournament_standings_select_own"  ON public.tournament_standings;
DROP POLICY IF EXISTS "tournament_standings_insert_own"  ON public.tournament_standings;
DROP POLICY IF EXISTS "tournament_standings_update_own"  ON public.tournament_standings;
DROP POLICY IF EXISTS "tournament_standings_delete_own"  ON public.tournament_standings;

-- ---- 4. New workspace-membership–based RLS policies -----

-- tournaments
-- SELECT: workspace member OR public (unguessable public_slug is used for public routes)
CREATE POLICY "tournaments_select_member"
  ON public.tournaments FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    OR (is_public = true)
  );

CREATE POLICY "tournaments_insert_member"
  ON public.tournaments FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "tournaments_update_member"
  ON public.tournaments FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournaments_delete_owner"
  ON public.tournaments FOR DELETE
  USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));

-- tournament_players
-- SELECT: workspace member (keep existing public policy for public tournaments)
CREATE POLICY "tournament_players_select_member"
  ON public.tournament_players FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_players_insert_member"
  ON public.tournament_players FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_players_update_member"
  ON public.tournament_players FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_players_delete_member"
  ON public.tournament_players FOR DELETE
  USING (public.is_workspace_member(workspace_id));

-- tournament_matches
CREATE POLICY "tournament_matches_select_member"
  ON public.tournament_matches FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_matches_insert_member"
  ON public.tournament_matches FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_matches_update_member"
  ON public.tournament_matches FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_matches_delete_member"
  ON public.tournament_matches FOR DELETE
  USING (public.is_workspace_member(workspace_id));

-- tournament_standings
CREATE POLICY "tournament_standings_select_member"
  ON public.tournament_standings FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_standings_insert_member"
  ON public.tournament_standings FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_standings_update_member"
  ON public.tournament_standings FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "tournament_standings_delete_member"
  ON public.tournament_standings FOR DELETE
  USING (public.is_workspace_member(workspace_id));

-- NOTE: The public SELECT policies for tournament_players and
-- tournament_matches ("tournament_players_select_public" and
-- "tournament_matches_select_public") created in migration
-- 20260224120000 are intentionally KEPT — they allow unauthenticated
-- users to read data for public tournaments, which is required by
-- the public pairings page (/public/t/:publicSlug).
