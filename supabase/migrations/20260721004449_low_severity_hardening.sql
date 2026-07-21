-- ============================================================
-- Low-severity hardening (audit findings, 2026-07-21)
--
-- 1. Pin search_path on the remaining functions that lack it.
--    SECURITY DEFINER functions with a mutable search_path are
--    vulnerable to schema-shadowing (and flagged by the Supabase
--    advisor). Bodies already schema-qualify their references, so
--    pinning is purely defensive.
--
-- 2. Codify out-of-band objects. is_player_in_tournament() and the
--    three *_select_self policies exist on BOTH prod and local but
--    appear in no migration file (they were applied directly at
--    some point). Recreating them here brings them under migration
--    control so `supabase db reset` reproduces the real schema.
-- ============================================================

-- ---- 1. Pin search_path -------------------------------------

ALTER FUNCTION public.is_workspace_member(UUID)  SET search_path = public;
ALTER FUNCTION public.get_workspace_role(UUID)   SET search_path = public;
ALTER FUNCTION public.handle_new_user_workspace() SET search_path = public;
ALTER FUNCTION public.handle_new_user_profile()   SET search_path = public;
ALTER FUNCTION public.can_manage_workspace(UUID)  SET search_path = public;

-- ---- 2. Codify out-of-band objects --------------------------

-- Lets a signed-in player read rows for tournaments they play in
-- (their tournament_players entry is linked via user_id).
CREATE OR REPLACE FUNCTION public.is_player_in_tournament(p_tournament_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "tournament_players_select_self" ON public.tournament_players;
CREATE POLICY "tournament_players_select_self"
  ON public.tournament_players FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tournament_matches_select_self" ON public.tournament_matches;
CREATE POLICY "tournament_matches_select_self"
  ON public.tournament_matches FOR SELECT
  USING (public.is_player_in_tournament(tournament_id));

DROP POLICY IF EXISTS "tournament_standings_select_self" ON public.tournament_standings;
CREATE POLICY "tournament_standings_select_self"
  ON public.tournament_standings FOR SELECT
  USING (
    player_id IN (
      SELECT id FROM public.tournament_players
      WHERE user_id = auth.uid()
    )
  );
