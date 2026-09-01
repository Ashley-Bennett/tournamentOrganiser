-- ============================================================
-- Season / quarter filters for player stats (2026-09-01)
--
-- The Pokemon competitive season runs 1 September to 31 August, so a
-- calendar year is the wrong unit for "how did I do this season?".
-- Every player stats RPC now takes an optional [p_from, p_to) window:
--
--   p_from / p_to NULL  -> all time (previous behaviour)
--
-- The window is applied to the TOURNAMENT's event date
-- (COALESCE(starts_at, created_at)) rather than per-match timestamps, so
-- a single event never straddles two periods: a tournament finished
-- after midnight still counts towards the day it was held.
--
-- Season quarters (Q1 Sep-Nov, Q2 Dec-Feb, Q3 Mar-May, Q4 Jun-Aug) fall
-- out of a calendar quarter on the date shifted back 8 months, which is
-- how get_player_trend now buckets and how get_player_stats_seasons
-- derives the season a tournament belongs to.
--
-- Signatures change (new trailing params), so each function is dropped
-- first: CREATE OR REPLACE would leave the old arity in place and make
-- the no-arg call ambiguous.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_player_overview_stats();
DROP FUNCTION IF EXISTS public.get_player_deck_stats();
DROP FUNCTION IF EXISTS public.get_player_round_performance();
DROP FUNCTION IF EXISTS public.get_player_trend();
DROP FUNCTION IF EXISTS public.get_player_matchup_matrix(INT, INT);
DROP FUNCTION IF EXISTS public.get_player_first_second_stats(INT, INT);

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_stats_seasons
-- Which seasons the player actually has results in, newest first.
-- Drives the season picker so empty seasons are never offered.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_stats_seasons()
RETURNS TABLE(
  season_start_year INT,
  tournaments       INT,
  matches           INT
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
    SELECT
      tp.id AS player_id,
      tp.tournament_id,
      EXTRACT(YEAR FROM (COALESCE(t.starts_at, t.created_at) - INTERVAL '8 months'))::INT AS season
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
  )
  SELECT
    me.season,
    COUNT(DISTINCT me.tournament_id)::INT AS tournaments,
    COUNT(tm.id)::INT                     AS matches
  FROM my_entries me
  LEFT JOIN public.tournament_matches tm
    ON tm.tournament_id = me.tournament_id
    AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    AND tm.status IN ('completed', 'bye')
  GROUP BY me.season
  ORDER BY me.season DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_overview_stats(p_from, p_to)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_overview_stats(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_deck_stats(p_from, p_to)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_deck_stats(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
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
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_matchup_matrix(p_deck_pokemon1, p_deck_pokemon2, p_from, p_to)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_matchup_matrix(
  p_deck_pokemon1 INT DEFAULT NULL,
  p_deck_pokemon2 INT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
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
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_first_second_stats(p_deck_pokemon1, p_deck_pokemon2, p_from, p_to)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_first_second_stats(
  p_deck_pokemon1 INT DEFAULT NULL,
  p_deck_pokemon2 INT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
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
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
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
      -- Same either-slot filter semantics as get_player_matchup_matrix.
      AND ((p_deck_pokemon1 IS NULL AND p_deck_pokemon2 IS NULL) OR (
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

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_round_performance(p_from, p_to)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_round_performance(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
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
  JOIN public.tournaments t ON t.id = tp.tournament_id
  JOIN public.tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    AND tm.status = 'completed'
    AND tm.player2_id IS NOT NULL
  WHERE tp.user_id = v_uid
    AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
    AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  GROUP BY tm.round_number
  ORDER BY tm.round_number;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_trend(p_from, p_to)
-- Win rate per SEASON quarter (Q1 Sep-Nov ... Q4 Jun-Aug), oldest first.
-- Buckets come from the tournament's event date shifted back 8 months, so a
-- calendar quarter on the shifted date is a season quarter on the real one.
-- With no window, the last 2 years are returned as before.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_trend(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
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
  WITH my_matches AS (
    SELECT
      tm.winner_id,
      tm.status,
      tm.player2_id,
      tp.id AS my_player_id,
      -- Shift back 8 months: Sep-Nov -> Q1, Dec-Feb -> Q2, Mar-May -> Q3, Jun-Aug -> Q4
      DATE_TRUNC('quarter', COALESCE(t.starts_at, t.created_at) - INTERVAL '8 months') AS shifted_start
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    JOIN public.tournament_matches tm
      ON tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
      AND tm.status = 'completed'
      AND tm.player2_id IS NOT NULL
    WHERE tp.user_id = v_uid
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
      AND (
        p_from IS NOT NULL OR p_to IS NOT NULL
        OR COALESCE(t.starts_at, t.created_at) >= (NOW() - INTERVAL '2 years')
      )
  )
  SELECT
    'Q' || EXTRACT(QUARTER FROM mm.shifted_start)::TEXT
        || ' ' || TO_CHAR(mm.shifted_start, 'YY')
        || '/' || TO_CHAR(mm.shifted_start + INTERVAL '1 year', 'YY')  AS period_label,
    (mm.shifted_start + INTERVAL '8 months')                            AS period_start,
    COUNT(*) FILTER (WHERE mm.winner_id = mm.my_player_id)::INT         AS wins,
    COUNT(*)::INT                                                       AS total
  FROM my_matches mm
  GROUP BY mm.shifted_start
  ORDER BY period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_stats_seasons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_overview_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_deck_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_round_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_trend(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_matchup_matrix(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_first_second_stats(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
