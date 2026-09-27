CREATE OR REPLACE FUNCTION public.get_player_first_second_stats(p_deck_pokemon1 integer DEFAULT NULL::integer, p_deck_pokemon2 integer DEFAULT NULL::integer, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_stack_variants boolean DEFAULT false)
 RETURNS TABLE(went_first_wins integer, went_first_total integer, went_second_wins integer, went_second_total integer, insights_count integer)
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
  insights_with_outcome AS (
    SELECT
      mi.went_first,
      CASE
        WHEN tm.winner_id = me.player_id THEN 'win'
        WHEN tm.winner_id IS NULL THEN 'draw'
        ELSE 'loss'
      END AS outcome
    FROM public.match_insights mi
    JOIN public.tournament_matches tm ON tm.id = mi.match_id
    -- Join on tournament to get the deck; match_insights.player_id = auth.users.id (v_uid)
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
    WHERE mi.player_id = v_uid
      AND mi.went_first IS NOT NULL
      AND tm.status = 'completed'
      AND tm.player2_id IS NOT NULL
      AND ((p_deck_pokemon1 IS NULL AND p_deck_pokemon2 IS NULL) OR
        public.deck_stats_key(me.deck_pokemon1, me.deck_pokemon2, p_stack_variants)
          = public.deck_stats_key(p_deck_pokemon1, p_deck_pokemon2, p_stack_variants))
  )
  SELECT
    COUNT(*) FILTER (WHERE went_first = TRUE  AND outcome = 'win')::INT  AS went_first_wins,
    COUNT(*) FILTER (WHERE went_first = TRUE)::INT                        AS went_first_total,
    COUNT(*) FILTER (WHERE went_first = FALSE AND outcome = 'win')::INT  AS went_second_wins,
    COUNT(*) FILTER (WHERE went_first = FALSE)::INT                       AS went_second_total,
    COUNT(*)::INT                                                          AS insights_count
  FROM insights_with_outcome;
END;
$function$
