-- ============================================================
-- Migration: Add user_id to tournament_players
--   - Nullable: name-only MVP entries still work
--   - When set, links the player row to a real user account
--   - Enables self-access RLS (player can read their own entry)
--     without requiring workspace membership
--   - Enables cross-workspace stats aggregation later
-- ============================================================

ALTER TABLE public.tournament_players
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_players_user_id
  ON public.tournament_players (user_id)
  WHERE user_id IS NOT NULL;

-- ============================================================
-- RLS: Allow a linked player to self-access their own entries
--   Added alongside the existing workspace-member policies so
--   that non-members who have been linked to a player row can
--   still read that row (and the corresponding match/standings
--   data for that tournament).
-- ============================================================

-- tournament_players: linked user can read their own rows
CREATE POLICY "tournament_players_select_self"
  ON public.tournament_players FOR SELECT
  USING (user_id = auth.uid());

-- tournament_matches: player can read matches they appear in
-- (requires joining to tournament_players; handled via a helper
--  function to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_player_in_tournament(p_tournament_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND user_id = auth.uid()
  );
$$;

CREATE POLICY "tournament_matches_select_self"
  ON public.tournament_matches FOR SELECT
  USING (public.is_player_in_tournament(tournament_id));

-- tournament_standings: player can read their own standings rows
CREATE POLICY "tournament_standings_select_self"
  ON public.tournament_standings FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM public.tournament_players WHERE user_id = auth.uid()
    )
  );
