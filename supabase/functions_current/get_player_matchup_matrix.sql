CREATE OR REPLACE FUNCTION public.get_player_matchup_matrix(p_deck_pokemon1 integer DEFAULT NULL::integer, p_deck_pokemon2 integer DEFAULT NULL::integer, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(opp_pokemon1 integer, opp_pokemon2 integer, matches_played integer, wins integer, losses integer, draws integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  my_matches AS (
    SELECT
      tm.id                                                                   AS match_id,
      me.player_id                                                            AS my_player_id,
      me.deck_pokemon1                                                        AS my_p1,
      me.deck_pokemon2                                                        AS my_p2,
      CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id
           ELSE tm.player1_id END                                             AS opp_player_id,
      tm.winner_id,
      tm.tournament_id
    FROM public.tournament_matches tm
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
      -- Filter is active when EITHER slot is provided — decks can legitimately
      -- have a NULL first slot, and p1-only checks would silently disable the filter.
      AND ((p_deck_pokemon1 IS NULL AND p_deck_pokemon2 IS NULL) OR (
        me.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
        AND me.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
      ))
  ),
  -- Resolve opponent deck: prefer match_insights (player-reported), fall back to tournament_players.
  -- match_insights.player_id is auth.users.id (v_uid), not tournament_players.id.
  with_opp_deck AS (
    SELECT
      mm.match_id,
      mm.my_player_id,
      mm.winner_id,
      COALESCE(mi.opponent_deck_pokemon1, opp_tp.deck_pokemon1) AS opp_p1,
      COALESCE(mi.opponent_deck_pokemon2, opp_tp.deck_pokemon2) AS opp_p2
    FROM my_matches mm
    LEFT JOIN public.tournament_players opp_tp
      ON opp_tp.id = mm.opp_player_id AND opp_tp.tournament_id = mm.tournament_id
    LEFT JOIN public.match_insights mi
      ON mi.match_id = mm.match_id AND mi.player_id = v_uid
  )
  SELECT
    wod.opp_p1 AS opp_pokemon1,
    wod.opp_p2 AS opp_pokemon2,
    COUNT(*)::INT                                              AS matches_played,
    COUNT(*) FILTER (WHERE wod.winner_id = wod.my_player_id)::INT AS wins,
    COUNT(*) FILTER (WHERE wod.winner_id IS NOT NULL
                       AND wod.winner_id != wod.my_player_id)::INT AS losses,
    COUNT(*) FILTER (WHERE wod.winner_id IS NULL)::INT         AS draws
  FROM with_opp_deck wod
  WHERE wod.opp_p1 IS NOT NULL OR wod.opp_p2 IS NOT NULL
  GROUP BY wod.opp_p1, wod.opp_p2
  ORDER BY matches_played DESC;
END;
$function$
