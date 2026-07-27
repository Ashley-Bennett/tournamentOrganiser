-- ============================================================
-- Stats top-3 / top-8 finishes from stored standings
--
-- Follow-up to 20260727120000_persist_standings. get_player_overview_stats
-- and get_player_deck_stats still derived finishing position with the old
-- points-only RANK(), so top-3/top-8 counts were wrong for tied fields.
-- Point them at tournament_standings.position (the tiebreaker-correct order)
-- like the other player RPCs. Everything else in each function is unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_overview_stats()
RETURNS TABLE(
  total_completed       INT,
  total_match_wins      INT,
  total_matches         INT,
  match_wins_no_byes    INT,
  matches_no_byes       INT,
  top3_count            INT,
  top8_count            INT,
  eligible_top3         INT,
  eligible_top8         INT,
  current_streak        INT,
  longest_win_streak    INT,
  longest_loss_streak   INT,
  nemesis_name          TEXT,
  nemesis_wins          INT,
  nemesis_losses        INT,
  victim_name           TEXT,
  victim_wins           INT,
  victim_losses         INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.created_at
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
  ),
  my_matches AS (
    SELECT
      tm.id AS match_id,
      tm.tournament_id,
      tm.round_number,
      tm.status,
      tm.winner_id,
      tm.player2_id,
      me.player_id AS my_player_id,
      CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id ELSE tm.player1_id END AS opp_player_id,
      tm.updated_at
    FROM public.tournament_matches tm
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    WHERE tm.status IN ('completed', 'bye')
  ),
  totals AS (
    SELECT
      COUNT(DISTINCT me.tournament_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM public.tournaments t
          WHERE t.id = me.tournament_id AND t.status = 'completed'
        )
      )::INT AS total_completed,
      COUNT(*)              FILTER (WHERE mm.status IN ('completed','bye'))::INT AS total_matches,
      COUNT(*)              FILTER (WHERE mm.status IN ('completed','bye')
                                      AND (mm.winner_id = mm.my_player_id OR mm.status = 'bye'))::INT AS total_wins,
      COUNT(*)              FILTER (WHERE mm.status = 'completed' AND mm.player2_id IS NOT NULL)::INT  AS matches_no_byes,
      COUNT(*)              FILTER (WHERE mm.status = 'completed' AND mm.player2_id IS NOT NULL
                                      AND mm.winner_id = mm.my_player_id)::INT                        AS wins_no_byes
    FROM my_entries me
    LEFT JOIN my_matches mm ON mm.tournament_id = me.tournament_id AND mm.my_player_id = me.player_id
  ),
  -- Positions now come from the stored, tiebreaker-correct standings.
  standings AS (
    SELECT ts.tournament_id, ts.player_id, ts.position, fs.n AS field_size
    FROM public.tournament_standings ts
    JOIN my_entries me ON me.tournament_id = ts.tournament_id AND me.player_id = ts.player_id
    JOIN public.tournaments t ON t.id = ts.tournament_id AND t.status = 'completed'
    JOIN (
      SELECT tournament_id, COUNT(*)::INT AS n
      FROM public.tournament_standings GROUP BY tournament_id
    ) fs ON fs.tournament_id = ts.tournament_id
  ),
  top_finishes AS (
    SELECT
      COUNT(*) FILTER (WHERE position <= 3 AND field_size >= 3)::INT  AS top3_count,
      COUNT(*) FILTER (WHERE position <= 8 AND field_size >= 8)::INT  AS top8_count,
      COUNT(*) FILTER (WHERE field_size >= 3)::INT                    AS eligible_top3,
      COUNT(*) FILTER (WHERE field_size >= 8)::INT                    AS eligible_top8
    FROM standings
  ),
  ordered_matches AS (
    SELECT
      mm.my_player_id,
      mm.winner_id,
      mm.status,
      ROW_NUMBER() OVER (ORDER BY mm.updated_at ASC) AS rn
    FROM my_matches mm
    WHERE mm.status IN ('completed', 'bye')
  ),
  match_outcomes AS (
    SELECT
      rn,
      CASE
        WHEN status = 'bye' THEN 'win'
        WHEN winner_id = my_player_id THEN 'win'
        WHEN winner_id IS NULL THEN 'draw'
        ELSE 'loss'
      END AS outcome
    FROM ordered_matches
  ),
  streak_groups AS (
    SELECT
      rn,
      outcome,
      rn - ROW_NUMBER() OVER (PARTITION BY outcome ORDER BY rn) AS grp
    FROM match_outcomes
    WHERE outcome IN ('win', 'loss')
  ),
  streak_lengths AS (
    SELECT outcome, COUNT(*)::INT AS streak_len
    FROM streak_groups
    GROUP BY outcome, grp
  ),
  streaks AS (
    SELECT
      MAX(streak_len) FILTER (WHERE outcome = 'win')::INT  AS longest_win,
      MAX(streak_len) FILTER (WHERE outcome = 'loss')::INT AS longest_loss
    FROM streak_lengths
  ),
  final_outcome AS (
    SELECT outcome FROM match_outcomes ORDER BY rn DESC LIMIT 1
  ),
  current_streak_calc AS (
    SELECT
      (SELECT outcome FROM final_outcome) AS last_outcome,
      COUNT(*)::INT AS cnt
    FROM match_outcomes mo
    WHERE mo.outcome = (SELECT outcome FROM final_outcome)
      AND mo.outcome IN ('win', 'loss')
      AND mo.rn > COALESCE((
        SELECT MAX(x.rn) FROM match_outcomes x
        WHERE x.outcome <> (SELECT outcome FROM final_outcome)
      ), 0)
  ),
  h2h AS (
    SELECT
      opp_tp.name AS opp_name,
      COUNT(*) FILTER (WHERE mm.winner_id = mm.my_player_id)::INT AS h2h_wins,
      COUNT(*) FILTER (WHERE mm.winner_id = opp_tp.id)::INT        AS h2h_losses
    FROM my_matches mm
    JOIN public.tournament_players opp_tp
      ON opp_tp.id = mm.opp_player_id AND opp_tp.tournament_id = mm.tournament_id
    WHERE mm.status = 'completed' AND mm.player2_id IS NOT NULL
    GROUP BY opp_tp.name
    HAVING COUNT(*) >= 3
  ),
  nemesis AS (
    SELECT opp_name, h2h_wins, h2h_losses
    FROM h2h
    ORDER BY (h2h_wins::FLOAT / NULLIF(h2h_wins + h2h_losses, 0)) ASC, (h2h_wins + h2h_losses) DESC
    LIMIT 1
  ),
  victim AS (
    SELECT opp_name, h2h_wins, h2h_losses
    FROM h2h
    ORDER BY (h2h_wins::FLOAT / NULLIF(h2h_wins + h2h_losses, 0)) DESC, (h2h_wins + h2h_losses) DESC
    LIMIT 1
  )
  SELECT
    t.total_completed,
    t.total_wins        AS total_match_wins,
    t.total_matches,
    t.wins_no_byes      AS match_wins_no_byes,
    t.matches_no_byes,
    tf.top3_count,
    tf.top8_count,
    tf.eligible_top3,
    tf.eligible_top8,
    CASE
      WHEN csc.last_outcome = 'win'  THEN  csc.cnt
      WHEN csc.last_outcome = 'loss' THEN -csc.cnt
      ELSE 0
    END::INT AS current_streak,
    COALESCE(s.longest_win, 0)  AS longest_win_streak,
    COALESCE(s.longest_loss, 0) AS longest_loss_streak,
    n.opp_name    AS nemesis_name,
    n.h2h_wins    AS nemesis_wins,
    n.h2h_losses  AS nemesis_losses,
    v.opp_name    AS victim_name,
    v.h2h_wins    AS victim_wins,
    v.h2h_losses  AS victim_losses
  FROM totals t
  CROSS JOIN top_finishes tf
  CROSS JOIN streaks s
  LEFT JOIN current_streak_calc csc ON TRUE
  LEFT JOIN nemesis n ON TRUE
  LEFT JOIN victim  v ON TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_player_deck_stats()
RETURNS TABLE(
  deck_pokemon1    INT,
  deck_pokemon2    INT,
  tournaments_played INT,
  match_wins       INT,
  total_matches    INT,
  top3_count       INT,
  top8_count       INT,
  first_used       TIMESTAMPTZ,
  last_used        TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2, tp.created_at
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
      AND (tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL)
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
  -- Positions now come from the stored, tiebreaker-correct standings.
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
$$;
