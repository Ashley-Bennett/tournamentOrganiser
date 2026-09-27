CREATE OR REPLACE FUNCTION public.get_player_deck_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_stack_variants boolean DEFAULT false)
 RETURNS TABLE(deck_pokemon1 integer, deck_pokemon2 integer, variants integer, tournaments_played integer, match_wins integer, total_matches integer, top3_count integer, top8_count integer, first_used timestamp with time zone, last_used timestamp with time zone)
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
    SELECT
      tp.id AS player_id, tp.tournament_id, tp.created_at,
      tp.deck_pokemon1 AS r1,
      tp.deck_pokemon2 AS r2,
      public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants) AS k
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
      me.k,
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
    GROUP BY me.k
  ),
  top_finishes AS (
    SELECT
      me.k,
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
    GROUP BY me.k
  ),
  summary AS (
    SELECT
      me.k,
      CASE WHEN COUNT(DISTINCT public.deck_norm(me.r1, me.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(me.r1, me.r2))
           ELSE me.k END AS shown,
      COUNT(DISTINCT public.deck_norm(me.r1, me.r2))::INT AS n_variants,
      COUNT(DISTINCT me.tournament_id)::INT AS tournaments_played,
      MIN(me.created_at)                    AS first_used,
      MAX(me.created_at)                    AS last_used
    FROM my_entries me
    GROUP BY me.k
  )
  SELECT
    s.shown[1],
    s.shown[2],
    s.n_variants,
    s.tournaments_played,
    COALESCE(ms.wins, 0)  AS match_wins,
    COALESCE(ms.total, 0) AS total_matches,
    COALESCE(tf.top3, 0)  AS top3_count,
    COALESCE(tf.top8, 0)  AS top8_count,
    s.first_used,
    s.last_used
  FROM summary s
  LEFT JOIN match_stats  ms ON ms.k = s.k
  LEFT JOIN top_finishes tf ON tf.k = s.k
  ORDER BY s.tournaments_played DESC, s.last_used DESC;
END;
$function$
