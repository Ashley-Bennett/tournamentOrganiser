-- Allow anonymous users to read published/active matches so that the
-- Supabase realtime subscription in PlayerTournamentView fires for all
-- match updates, not just the player's own match.
--
-- Previously, the SELECT policies on tournament_matches only covered
-- authenticated owners and workspace members. Unauthenticated players
-- use a device_token (not auth.uid()), so they fell through with no access.
-- The SECURITY DEFINER RPC returned all matches fine, but the realtime
-- subscription ran as anon and received no events for other players' matches.

CREATE POLICY "tournament_matches_select_anon"
  ON public.tournament_matches
  FOR SELECT
  TO anon
  USING (
    pairings_published = true
    OR status IN ('pending', 'completed', 'bye')
  );
