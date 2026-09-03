CREATE OR REPLACE FUNCTION public.get_player_deck_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(deck_pokemon1 integer, deck_pokemon2 integer, tournaments_played integer, match_wins integer, total_matches integer, top3_count integer, top8_count integer, first_used timestamp with time zone, last_used timestamp with time zone)
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
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2, tp.created_at
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  match_stats AS (
    SELECT
      me.deck_pokemon1,
      me.deck_pokemon2,
      COUNT(*) FILTER (
        WHERE (tm.status = 'completed' AND tm.player2_id IS NOT NULL)
           OR tm.status = 'bye'
      )::INT AS total,
      COUNT(*) FILTER (
        WHERE (tm.status = 'completed' AND tm.player2_id IS NOT NULL AND tm.winner_id = me.player_id)
           OR tm.status = 'bye'
      )::INT AS wins
    FROM my_entries me
    LEFT JOIN public.tournament_matches tm
      ON tm.tournament_id = me.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    GROUP BY me.deck_pokemon1, me.deck_pokemon2
  ),
  top_finishes AS (
    SELECT
      me.deck_pokemon1,
      me.deck_pokemon2,
      COUNT(*) FILTER (WHERE ts.position <= 3 AND fs.n >= 3)::INT AS top3,
      COUNT(*) FILTER (WHERE ts.position <= 8 AND fs.n >= 8)::INT AS top8
    FROM my_entries me
    JOIN public.tournaments t ON t.id = me.tournament_id AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = me.tournament_id AND ts.player_id = me.player_id
    JOIN (
      SELECT tournament_id, COUNT(*)::INT AS n
      FROM public.tournament_standings GROUP BY tournament_id
    ) fs ON fs.tournament_id = me.tournament_id
    GROUP BY me.deck_pokemon1, me.deck_pokemon2
  ),
  summary AS (
    SELECT
      me.deck_pokemon1,
      me.deck_pokemon2,
      COUNT(DISTINCT me.tournament_id)::INT AS tournaments_played,
      MIN(me.created_at)                    AS first_used,
      MAX(me.created_at)                    AS last_used
    FROM my_entries me
    GROUP BY me.deck_pokemon1, me.deck_pokemon2
  )
  SELECT
    s.deck_pokemon1,
    s.deck_pokemon2,
    s.tournaments_played,
    COALESCE(ms.wins, 0)  AS match_wins,
    COALESCE(ms.total, 0) AS total_matches,
    COALESCE(tf.top3, 0)  AS top3_count,
    COALESCE(tf.top8, 0)  AS top8_count,
    s.first_used,
    s.last_used
  FROM summary s
  LEFT JOIN match_stats  ms ON ms.deck_pokemon1 IS NOT DISTINCT FROM s.deck_pokemon1
                            AND ms.deck_pokemon2 IS NOT DISTINCT FROM s.deck_pokemon2
  LEFT JOIN top_finishes tf ON tf.deck_pokemon1 IS NOT DISTINCT FROM s.deck_pokemon1
                            AND tf.deck_pokemon2 IS NOT DISTINCT FROM s.deck_pokemon2
  ORDER BY s.tournaments_played DESC, s.last_used DESC;
END;
$function$
