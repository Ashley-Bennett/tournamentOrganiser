-- ============================================================
-- Player trend takes a bucket (2026-09-01) — Phase 6
--
-- get_player_trend hardcoded DATE_TRUNC('quarter', ...). The organiser
-- timeline offers month / quarter / year, and the two pages now share
-- one timeline component, so the player trend takes the same parameter
-- and the shared component behaves identically on both.
--
-- p_bucket defaults to 'quarter', which is exactly what the function
-- did before, so an un-updated client keeps its current behaviour.
--
-- DROP first: a new parameter cannot be added by CREATE OR REPLACE.
-- The body is otherwise unchanged from 20260901000600.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_player_trend(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.get_player_trend(
  p_from    TIMESTAMPTZ DEFAULT NULL,
  p_to      TIMESTAMPTZ DEFAULT NULL,
  p_game_id TEXT DEFAULT NULL,
  p_bucket  TEXT DEFAULT 'quarter'
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

  IF p_bucket NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION 'Unsupported bucket %, expected month, quarter or year', p_bucket;
  END IF;

  RETURN QUERY
  WITH my_matches AS (
    SELECT
      tm.winner_id,
      tm.status,
      tm.player2_id,
      tp.id AS my_player_id,
      DATE_TRUNC(p_bucket, COALESCE(t.starts_at, t.created_at)) AS period_start
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
    CASE p_bucket
      WHEN 'month'   THEN TO_CHAR(mm.period_start, 'Mon YY')
      WHEN 'quarter' THEN 'Q' || EXTRACT(QUARTER FROM mm.period_start)::TEXT
                            || ' ' || TO_CHAR(mm.period_start, 'YY')
      ELSE TO_CHAR(mm.period_start, 'YYYY')
    END                                                                 AS period_label,
    mm.period_start                                                     AS period_start,
    COUNT(*) FILTER (WHERE mm.winner_id = mm.my_player_id)::INT         AS wins,
    COUNT(*)::INT                                                       AS total
  FROM my_matches mm
  GROUP BY mm.period_start
  ORDER BY period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_trend(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
