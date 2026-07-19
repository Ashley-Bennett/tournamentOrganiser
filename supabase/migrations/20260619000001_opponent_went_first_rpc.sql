-- Returns the opponent's went_first value for each match where the caller is a participant.
-- Only exposes went_first (not deck data) — safe to reveal since both players were present.
--
-- NOTE: tournament_matches.player1_id / player2_id reference tournament_players.id,
-- NOT auth.users.id. The caller's participation must therefore be resolved through
-- their linked tournament_players row (user_id = auth.uid()). Comparing player1_id
-- directly to auth.uid() never matched, so this RPC always returned no rows.
CREATE OR REPLACE FUNCTION public.get_opponent_went_first(p_match_ids UUID[])
RETURNS TABLE(match_id UUID, went_first BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT mi.match_id, mi.went_first
  FROM public.match_insights mi
  JOIN public.tournament_matches tm ON tm.id = mi.match_id
  JOIN public.tournament_players me
    ON me.tournament_id = tm.tournament_id
   AND me.user_id = auth.uid()
   AND (tm.player1_id = me.id OR tm.player2_id = me.id)
  WHERE mi.match_id = ANY(p_match_ids)
    AND mi.player_id <> auth.uid();
END;
$$;
