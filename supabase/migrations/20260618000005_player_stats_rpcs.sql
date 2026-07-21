-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_overview_stats
-- Returns a single row of headline numbers for the authenticated player.
-- ─────────────────────────────────────────────────────────────────────────────
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
    -- All tournament_players rows for this user
    SELECT tp.id AS player_id, tp.tournament_id, tp.created_at
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
  ),
  my_matches AS (
    -- All completed matches (not byes) involving this user, ordered by match time
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
  -- Aggregate totals
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
  -- Standings for completed tournaments — for top-N finishes.
  -- tournament_standings is never populated by the app, so positions are
  -- derived from match results (same scoring as get_my_player_entries),
  -- ranking the FULL field of each tournament — a rank/field computed only
  -- over the caller's own row is always 1/1.
  completed_points AS (
    SELECT
      tp.tournament_id,
      tp.id AS player_id,
      COALESCE(SUM(
        CASE
          WHEN tm2.status = 'bye'                                                           THEN 3
          WHEN tm2.player2_id IS NULL AND tm2.result = 'loss' AND tm2.status = 'completed'  THEN 0
          WHEN tm2.status = 'completed' AND tm2.winner_id = tp.id                           THEN 3
          WHEN tm2.status = 'completed' AND tm2.winner_id IS NULL                           THEN 1
          WHEN tm2.status = 'completed'                                                     THEN 0
          ELSE 0
        END
      ), 0) AS match_points
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id AND t.status = 'completed'
    LEFT JOIN public.tournament_matches tm2
      ON  tm2.tournament_id = tp.tournament_id
      AND (tm2.player1_id = tp.id OR tm2.player2_id = tp.id)
    WHERE tp.tournament_id IN (SELECT me2.tournament_id FROM my_entries me2)
    GROUP BY tp.tournament_id, tp.id
  ),
  ranked_field AS (
    SELECT
      cp.tournament_id,
      cp.player_id,
      RANK() OVER (PARTITION BY cp.tournament_id ORDER BY cp.match_points DESC)::INT AS position,
      COUNT(*) OVER (PARTITION BY cp.tournament_id)::INT AS field_size
    FROM completed_points cp
  ),
  standings AS (
    SELECT rf.tournament_id, rf.player_id, rf.position, rf.field_size
    FROM ranked_field rf
    JOIN my_entries me ON me.tournament_id = rf.tournament_id AND me.player_id = rf.player_id
  ),
  top_finishes AS (
    SELECT
      COUNT(*) FILTER (WHERE position <= 3 AND field_size >= 3)::INT  AS top3_count,
      COUNT(*) FILTER (WHERE position <= 8 AND field_size >= 8)::INT  AS top8_count,
      COUNT(*) FILTER (WHERE field_size >= 3)::INT                    AS eligible_top3,
      COUNT(*) FILTER (WHERE field_size >= 8)::INT                    AS eligible_top8
    FROM standings
  ),
  -- Streak: walk matches in chronological order and compute streaks
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
  -- Group consecutive same-outcomes using the classic island technique
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
  -- Current streak: consecutive same-outcome matches counting back from the
  -- most recent one — i.e. every match after the last match whose outcome
  -- differs from the final outcome. (The previous rn - ROW_NUMBER() DESC
  -- formula only equalled 0 for a single-match history, so the streak was
  -- permanently stuck at 0.)
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
  -- Head-to-head: opponent player names, win/loss counts
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

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_deck_stats
-- Per-deck breakdown for all decks the player has registered.
-- ─────────────────────────────────────────────────────────────────────────────
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
  top_finishes AS (
    SELECT
      me.deck_pokemon1,
      me.deck_pokemon2,
      COUNT(*) FILTER (WHERE pos.position <= 3 AND pos.field_size >= 3)::INT AS top3,
      COUNT(*) FILTER (WHERE pos.position <= 8 AND pos.field_size >= 8)::INT AS top8
    FROM my_entries me
    JOIN public.tournaments t ON t.id = me.tournament_id AND t.status = 'completed'
    JOIN (
      -- tournament_standings is never populated; rank the full field from
      -- match results (same scoring as get_my_player_entries).
      SELECT
        cp.tournament_id,
        cp.player_id,
        RANK() OVER (PARTITION BY cp.tournament_id ORDER BY cp.match_points DESC)::INT AS position,
        COUNT(*) OVER (PARTITION BY cp.tournament_id)::INT AS field_size
      FROM (
        SELECT
          tp.tournament_id,
          tp.id AS player_id,
          COALESCE(SUM(
            CASE
              WHEN tm2.status = 'bye'                                                           THEN 3
              WHEN tm2.player2_id IS NULL AND tm2.result = 'loss' AND tm2.status = 'completed'  THEN 0
              WHEN tm2.status = 'completed' AND tm2.winner_id = tp.id                           THEN 3
              WHEN tm2.status = 'completed' AND tm2.winner_id IS NULL                           THEN 1
              WHEN tm2.status = 'completed'                                                     THEN 0
              ELSE 0
            END
          ), 0) AS match_points
        FROM public.tournament_players tp
        LEFT JOIN public.tournament_matches tm2
          ON  tm2.tournament_id = tp.tournament_id
          AND (tm2.player1_id = tp.id OR tm2.player2_id = tp.id)
        WHERE tp.tournament_id IN (SELECT me2.tournament_id FROM my_entries me2)
        GROUP BY tp.tournament_id, tp.id
      ) cp
    ) pos ON pos.tournament_id = me.tournament_id AND pos.player_id = me.player_id
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

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_matchup_matrix
-- Matchup data grouped by opponent archetype (deck_pokemon1 + deck_pokemon2).
-- Optional deck filter narrows to games where the player used that deck.
-- Merges tournament_players deck data with player-reported match_insights.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_matchup_matrix(
  p_deck_pokemon1 INT DEFAULT NULL,
  p_deck_pokemon2 INT DEFAULT NULL
)
RETURNS TABLE(
  opp_pokemon1   INT,
  opp_pokemon2   INT,
  matches_played INT,
  wins           INT,
  losses         INT,
  draws          INT
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
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
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
      -- Optional: filter to matches where player used the specified deck
      AND (p_deck_pokemon1 IS NULL OR (
        me.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
        AND me.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
      ))
  ),
  -- Resolve opponent deck: prefer match_insights (player-reported), fall back to tournament_players
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
      ON mi.match_id = mm.match_id AND mi.player_id = mm.my_player_id
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_round_performance
-- Win rate per round number across all tournaments.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_round_performance()
RETURNS TABLE(
  round_number INT,
  wins         INT,
  total        INT
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
  SELECT
    tm.round_number::INT,
    COUNT(*) FILTER (WHERE tm.winner_id = tp.id)::INT AS wins,
    COUNT(*) FILTER (WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL)::INT AS total
  FROM public.tournament_players tp
  JOIN public.tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    AND tm.status = 'completed'
    AND tm.player2_id IS NOT NULL
  WHERE tp.user_id = v_uid
  GROUP BY tm.round_number
  ORDER BY tm.round_number;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_trend
-- Quarterly win rate over time (last 8 quarters).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_trend()
RETURNS TABLE(
  period_label TEXT,
  period_start TIMESTAMPTZ,
  wins         INT,
  total        INT
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
  SELECT
    TO_CHAR(DATE_TRUNC('quarter', tm.updated_at), 'Q"Q" YYYY') AS period_label,
    DATE_TRUNC('quarter', tm.updated_at)                        AS period_start,
    COUNT(*) FILTER (WHERE tm.winner_id = tp.id)::INT           AS wins,
    COUNT(*) FILTER (WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL)::INT AS total
  FROM public.tournament_players tp
  JOIN public.tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    AND tm.status = 'completed'
    AND tm.player2_id IS NOT NULL
  WHERE tp.user_id = v_uid
    AND tm.updated_at >= (NOW() - INTERVAL '2 years')
  GROUP BY DATE_TRUNC('quarter', tm.updated_at)
  ORDER BY period_start;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_first_second_stats
-- Win rate split by going first vs second, from match_insights data.
-- Optional deck filter to see if a specific deck bucks the trend.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_first_second_stats(
  p_deck_pokemon1 INT DEFAULT NULL,
  p_deck_pokemon2 INT DEFAULT NULL
)
RETURNS TABLE(
  went_first_wins  INT,
  went_first_total INT,
  went_second_wins INT,
  went_second_total INT,
  insights_count   INT
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
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
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
    JOIN my_entries me ON me.player_id = mi.player_id
      AND me.tournament_id = tm.tournament_id
    WHERE mi.player_id = v_uid
      AND mi.went_first IS NOT NULL
      AND tm.status = 'completed'
      AND tm.player2_id IS NOT NULL
      -- Optional deck filter: player used the specified deck in that tournament
      AND (p_deck_pokemon1 IS NULL OR (
        me.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
        AND me.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
      ))
  )
  SELECT
    COUNT(*) FILTER (WHERE went_first = TRUE  AND outcome = 'win')::INT  AS went_first_wins,
    COUNT(*) FILTER (WHERE went_first = TRUE)::INT                        AS went_first_total,
    COUNT(*) FILTER (WHERE went_first = FALSE AND outcome = 'win')::INT  AS went_second_wins,
    COUNT(*) FILTER (WHERE went_first = FALSE)::INT                       AS went_second_total,
    COUNT(*)::INT                                                          AS insights_count
  FROM insights_with_outcome;
END;
$$;
