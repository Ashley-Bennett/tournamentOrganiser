CREATE OR REPLACE FUNCTION public.get_organiser_player_opponents(p_workspace_id uuid, p_identity_key text, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(opponent_key text, opponent_name text, is_linked boolean, matches_played integer, wins integer, losses integer, draws integer, last_played timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH ids AS (
    SELECT * FROM public.workspace_player_identities(p_workspace_id)
  ),
  chosen AS (
    SELECT i.*
    FROM ids i
    WHERE (
      p_tournament_ids IS NOT NULL AND i.tournament_id = ANY(p_tournament_ids)
    )
    OR (
      p_tournament_ids IS NULL
        AND (p_game_id IS NULL OR i.game_id = p_game_id)
        AND (p_from IS NULL OR i.played_at >= p_from)
        AND (p_to   IS NULL OR i.played_at <  p_to)
    )
  ),
  duels AS (
    SELECT
      c.played_at,
      CASE
        WHEN tm.player1_id = c.tournament_player_id THEN tm.player2_id
        ELSE tm.player1_id
      END AS opp_tpid,
      CASE
        WHEN tm.winner_id = c.tournament_player_id THEN 'win'
        WHEN tm.winner_id IS NULL                  THEN 'draw'
        ELSE 'loss'
      END AS outcome
    FROM chosen c
    JOIN public.tournament_matches tm
      ON tm.tournament_id = c.tournament_id
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND (
          tm.player1_id = c.tournament_player_id
       OR tm.player2_id = c.tournament_player_id
     )
    WHERE c.identity_key = p_identity_key
  )
  SELECT
    o.identity_key::TEXT,
    MAX(o.display_name)::TEXT,
    BOOL_OR(o.is_linked),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE d.outcome = 'win')::INT,
    COUNT(*) FILTER (WHERE d.outcome = 'loss')::INT,
    COUNT(*) FILTER (WHERE d.outcome = 'draw')::INT,
    MAX(d.played_at)
  FROM duels d
  JOIN ids o ON o.tournament_player_id = d.opp_tpid
  WHERE o.identity_key <> p_identity_key
  GROUP BY o.identity_key
  ORDER BY COUNT(*) DESC, MAX(d.played_at) DESC;
END;
$function$
