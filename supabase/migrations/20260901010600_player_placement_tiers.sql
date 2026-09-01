-- ============================================================
-- Player placement tiers (2026-09-01) — Phase 7
--
-- The overview reported Top 3 and Top 8 rates and nothing else, so a
-- player who had actually won an event saw no sign of it, and a player
-- who had never come close still saw two empty-looking rates.
--
-- Adds the missing first-place tier plus the player's best finish, so
-- the page can show a tier only once it has been reached: place 8th and
-- you get a Top 8 rate; win one and Top 3 and 1st appear alongside it.
--
-- Eligibility thresholds match the tier: winning a two-player event is
-- a win, but "1st of 1" is not, so a field of at least 2 is required for
-- first, 3 for top 3 and 8 for top 8. Rates are always out of the events
-- that could have produced that tier, never out of every event played.
--
-- DROP first: adding OUT columns changes the return type, which also
-- discards the EXECUTE grant, reissued at the end. The body is otherwise
-- unchanged from 20260901000600.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_player_overview_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.get_player_overview_stats(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL,
  p_game_id TEXT DEFAULT NULL
)
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
  first_count           INT,
  eligible_first        INT,
  best_finish           INT,
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
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
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
      COUNT(*) FILTER (WHERE field_size >= 8)::INT                    AS eligible_top8,
      COUNT(*) FILTER (WHERE position = 1 AND field_size >= 2)::INT   AS first_count,
      COUNT(*) FILTER (WHERE field_size >= 2)::INT                    AS eligible_first,
      -- Best finish ignores the field-size floor: coming 1st of 2 is still
      -- the best you have done, even though it does not count as a win above.
      MIN(position)::INT                                              AS best_finish
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
    tf.first_count,
    tf.eligible_first,
    tf.best_finish,
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

GRANT EXECUTE ON FUNCTION public.get_player_overview_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
