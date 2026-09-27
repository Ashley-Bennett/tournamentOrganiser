CREATE OR REPLACE FUNCTION public.get_player_matchup_matrix(p_deck_pokemon1 integer DEFAULT NULL::integer, p_deck_pokemon2 integer DEFAULT NULL::integer, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_stack_variants boolean DEFAULT false)
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
      CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id
           ELSE tm.player1_id END                                             AS opp_player_id,
      tm.winner_id,
      tm.tournament_id
    FROM public.tournament_matches tm
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
      AND ((p_deck_pokemon1 IS NULL AND p_deck_pokemon2 IS NULL) OR
        public.deck_stats_key(me.deck_pokemon1, me.deck_pokemon2, p_stack_variants)
          = public.deck_stats_key(p_deck_pokemon1, p_deck_pokemon2, p_stack_variants))
  ),
  -- Resolve opponent deck: prefer match_insights (player-reported), fall back to tournament_players.
  -- match_insights.player_id is auth.users.id (v_uid), not tournament_players.id.
  with_opp_deck AS (
    SELECT
      mm.my_player_id,
      mm.winner_id,
      CASE WHEN mi.opponent_deck_pokemon1 IS NOT NULL OR mi.opponent_deck_pokemon2 IS NOT NULL
           THEN mi.opponent_deck_pokemon1 ELSE opp_tp.deck_pokemon1 END AS r1,
      CASE WHEN mi.opponent_deck_pokemon1 IS NOT NULL OR mi.opponent_deck_pokemon2 IS NOT NULL
           THEN mi.opponent_deck_pokemon2 ELSE opp_tp.deck_pokemon2 END AS r2
    FROM my_matches mm
    LEFT JOIN public.tournament_players opp_tp
      ON opp_tp.id = mm.opp_player_id AND opp_tp.tournament_id = mm.tournament_id
    LEFT JOIN public.match_insights mi
      ON mi.match_id = mm.match_id AND mi.player_id = v_uid
  ),
  keyed AS (
    SELECT wod.*, public.deck_stats_key(wod.r1, wod.r2, p_stack_variants) AS k
    FROM with_opp_deck wod
    WHERE wod.r1 IS NOT NULL OR wod.r2 IS NOT NULL
  ),
  grouped AS (
    SELECT
      CASE WHEN COUNT(DISTINCT public.deck_norm(kd.r1, kd.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(kd.r1, kd.r2))
           ELSE kd.k END AS shown,
      COUNT(*)::INT                                                AS n_played,
      COUNT(*) FILTER (WHERE kd.winner_id = kd.my_player_id)::INT AS n_wins,
      COUNT(*) FILTER (WHERE kd.winner_id IS NOT NULL
                         AND kd.winner_id != kd.my_player_id)::INT AS n_losses,
      COUNT(*) FILTER (WHERE kd.winner_id IS NULL)::INT            AS n_draws
    FROM keyed kd
    GROUP BY kd.k
  )
  SELECT g.shown[1], g.shown[2], g.n_played, g.n_wins, g.n_losses, g.n_draws
  FROM grouped g
  ORDER BY g.n_played DESC;
END;
$function$
