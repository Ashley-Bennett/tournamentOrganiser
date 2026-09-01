-- ============================================================
-- Calendar-season trend labels (2026-09-01) — 1.0 Phase F follow-up
--
-- get_player_trend labelled every bucket as a split year ("Q3 26/27"),
-- which is right for the Play! Pokemon season but wrong for a game
-- whose season is the calendar year — the period picker beside it
-- reads "2026" while the chart claimed "26/27".
--
-- Only the period_label expression changes; the rest is as it was in
-- 20260901000600_stats_per_game.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_trend(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL,
  p_game_id TEXT DEFAULT NULL,
  p_season_start_month INT DEFAULT 9
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
      DATE_TRUNC('quarter', COALESCE(t.starts_at, t.created_at) - (INTERVAL '1 month' * (p_season_start_month - 1))) AS shifted_start
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    JOIN public.tournament_matches tm
      ON tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
      AND tm.status = 'completed'
      AND tm.player2_id IS NOT NULL
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
      AND (
        p_from IS NOT NULL OR p_to IS NOT NULL
        OR COALESCE(t.starts_at, t.created_at) >= (NOW() - INTERVAL '2 years')
      )
  )
  SELECT
    -- A split-year season reads "Q1 26/27"; a calendar one is just "Q1 26",
    -- since there is no second year for it to run into.
    'Q' || EXTRACT(QUARTER FROM mm.shifted_start)::TEXT
        || ' ' || TO_CHAR(mm.shifted_start, 'YY')
        || CASE
             WHEN p_season_start_month = 1 THEN ''
             ELSE '/' || TO_CHAR(mm.shifted_start + INTERVAL '1 year', 'YY')
           END                                                          AS period_label,
    (mm.shifted_start + (INTERVAL '1 month' * (p_season_start_month - 1)))                            AS period_start,
    COUNT(*) FILTER (WHERE mm.winner_id = mm.my_player_id)::INT         AS wins,
    COUNT(*)::INT                                                       AS total
  FROM my_matches mm
  GROUP BY mm.shifted_start
  ORDER BY period_start;
END;
$$;
