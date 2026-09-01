-- ============================================================
-- Timing stats (2026-09-01) — Phase 8b
--
-- Built on the two facts 20260901010700 started recording. A match
-- only has a duration when BOTH exist:
--
--   * its round's started_at (tournament_rounds), and
--   * its own result_recorded_at.
--
-- Everything before that migration has neither, so the stats simply
-- have less to work with rather than being wrong. Callers surface how
-- many matches were timed so a thin sample is visible.
--
-- What a "duration" actually measures: round start to the moment the
-- result was recorded, minus any time the round was paused. That
-- includes walking to the desk, so it reads slightly long and rewards
-- prompt reporting. It is a pace measure, not a stopwatch.
--
-- Byes are excluded throughout — nobody played.
-- ============================================================

-- Replaces the version whose timings could never populate: it measured
-- MAX(updated_at) - MIN(created_at), and updated_at is only ever the insert
-- time, so every round scored ~0 and was discarded by its own sanity guard.
DROP FUNCTION IF EXISTS public.get_organiser_round_health(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

-- ─────────────────────────────────────────────────────────────────────────────
-- timed_matches — the shared basis for every stat below.
--
-- Not a view: it needs the workspace guard that workspace_player_identities
-- applies, and inlining it keeps each RPC's permission story identical.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_organiser_round_health(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT        DEFAULT NULL
)
RETURNS TABLE(
  round_number     INT,
  events           INT,
  matches          INT,
  timed_matches    INT,
  median_minutes   NUMERIC,
  longest_minutes  NUMERIC,
  round_minutes    NUMERIC,
  clock_pct        NUMERIC,
  drops_at_round   INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH chosen_events AS (
    SELECT DISTINCT i.tournament_id AS tid
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
  ),
  all_matches AS (
    SELECT tm.tournament_id, tm.round_number::INT AS rnd, tm.id, tm.result_recorded_at
    FROM public.tournament_matches tm
    JOIN chosen_events ce ON ce.tid = tm.tournament_id
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
  ),
  timed AS (
    SELECT
      am.rnd,
      am.tournament_id,
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (am.result_recorded_at - tr.started_at)) - tr.paused_seconds
      ) / 60.0 AS minutes,
      tr.duration_minutes
    FROM all_matches am
    JOIN public.tournament_rounds tr
      ON tr.tournament_id = am.tournament_id AND tr.round_number = am.rnd
    WHERE am.result_recorded_at IS NOT NULL
      AND am.result_recorded_at >= tr.started_at
  ),
  round_spans AS (
    -- How long the round itself ran, from its own record rather than from the
    -- last result: a round can be closed after the final result comes in.
    SELECT
      tr.round_number::INT AS rnd,
      (EXTRACT(EPOCH FROM (COALESCE(tr.ended_at, now()) - tr.started_at)) - tr.paused_seconds) / 60.0 AS minutes
    FROM public.tournament_rounds tr
    JOIN chosen_events ce ON ce.tid = tr.tournament_id
    WHERE tr.ended_at IS NOT NULL
  ),
  drops AS (
    SELECT tp.dropped_at_round::INT AS rnd, COUNT(*)::INT AS n
    FROM public.tournament_players tp
    JOIN chosen_events ce ON ce.tid = tp.tournament_id
    WHERE tp.dropped AND tp.dropped_at_round IS NOT NULL
    GROUP BY tp.dropped_at_round
  )
  SELECT
    am.rnd,
    COUNT(DISTINCT am.tournament_id)::INT,
    COUNT(*)::INT,
    (SELECT COUNT(*)::INT FROM timed t WHERE t.rnd = am.rnd),
    (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)::NUMERIC, 1)
       FROM timed t WHERE t.rnd = am.rnd),
    (SELECT ROUND(MAX(t.minutes)::NUMERIC, 1) FROM timed t WHERE t.rnd = am.rnd),
    (SELECT ROUND(AVG(rs.minutes)::NUMERIC, 1) FROM round_spans rs WHERE rs.rnd = am.rnd),
    -- Share of the configured clock the median game used. NULL when no round at
    -- this number had a timer set.
    (SELECT ROUND(
              (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)
               / NULLIF(AVG(t.duration_minutes), 0) * 100)::NUMERIC, 0)
       FROM timed t WHERE t.rnd = am.rnd AND t.duration_minutes IS NOT NULL),
    COALESCE((SELECT d.n FROM drops d WHERE d.rnd = am.rnd), 0)
  FROM all_matches am
  GROUP BY am.rnd
  ORDER BY am.rnd;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_player_pace
--
-- Who plays fast and who uses the whole clock. The question an organiser asks
-- is "does this player always go to time", so clock_pct is the headline and the
-- raw minutes are shown beside it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_player_pace(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT        DEFAULT NULL,
  p_min_matches  INT         DEFAULT 3
)
RETURNS TABLE(
  identity_key   TEXT,
  display_name   TEXT,
  is_linked      BOOLEAN,
  timed_matches  INT,
  median_minutes NUMERIC,
  fastest_minutes NUMERIC,
  slowest_minutes NUMERIC,
  clock_pct      NUMERIC,
  went_to_time   INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH in_range AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
  ),
  timed AS (
    SELECT
      ir.identity_key AS ikey,
      ir.display_name AS name,
      ir.is_linked    AS linked,
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (tm.result_recorded_at - tr.started_at)) - tr.paused_seconds
      ) / 60.0 AS minutes,
      tr.duration_minutes
    FROM in_range ir
    JOIN public.tournament_matches tm
      ON tm.tournament_id = ir.tournament_id
     AND (tm.player1_id = ir.tournament_player_id OR tm.player2_id = ir.tournament_player_id)
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND tm.result_recorded_at IS NOT NULL
    JOIN public.tournament_rounds tr
      ON tr.tournament_id = tm.tournament_id AND tr.round_number = tm.round_number
    WHERE tm.result_recorded_at >= tr.started_at
  )
  SELECT
    t.ikey,
    MAX(t.name),
    BOOL_OR(t.linked),
    COUNT(*)::INT,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)::NUMERIC, 1),
    ROUND(MIN(t.minutes)::NUMERIC, 1),
    ROUND(MAX(t.minutes)::NUMERIC, 1),
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)
           / NULLIF(AVG(t.duration_minutes), 0) * 100)::NUMERIC, 0),
    -- Games that ran to 95% of the clock or beyond: "always goes to time".
    COUNT(*) FILTER (
      WHERE t.duration_minutes IS NOT NULL
        AND t.minutes >= t.duration_minutes * 0.95
    )::INT
  FROM timed t
  GROUP BY t.ikey
  HAVING COUNT(*) >= GREATEST(p_min_matches, 1)
  ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes) DESC NULLS LAST;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_game_pace
--
-- The player's own version, plus the detail behind their fastest game — the
-- event, the deck and the opponent — which is the bit that makes it fun.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_game_pace(
  p_from    TIMESTAMPTZ DEFAULT NULL,
  p_to      TIMESTAMPTZ DEFAULT NULL,
  p_game_id TEXT        DEFAULT NULL
)
RETURNS TABLE(
  timed_matches     INT,
  median_minutes    NUMERIC,
  clock_pct         NUMERIC,
  went_to_time      INT,
  fastest_minutes   NUMERIC,
  fastest_event     TEXT,
  fastest_opponent  TEXT,
  fastest_deck1     INT,
  fastest_deck2     INT,
  fastest_won       BOOLEAN,
  slowest_minutes   NUMERIC,
  slowest_event     TEXT,
  slowest_opponent  TEXT
)
LANGUAGE plpgsql
STABLE
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
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2, t.name AS event_name
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  timed AS (
    SELECT
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (tm.result_recorded_at - tr.started_at)) - tr.paused_seconds
      ) / 60.0 AS minutes,
      tr.duration_minutes,
      me.event_name,
      me.deck_pokemon1,
      me.deck_pokemon2,
      opp.name AS opponent_name,
      tm.winner_id = me.player_id AS won
    FROM my_entries me
    JOIN public.tournament_matches tm
      ON tm.tournament_id = me.tournament_id
     AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND tm.result_recorded_at IS NOT NULL
    JOIN public.tournament_rounds tr
      ON tr.tournament_id = tm.tournament_id AND tr.round_number = tm.round_number
    LEFT JOIN public.tournament_players opp
      ON opp.id = CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id ELSE tm.player1_id END
    WHERE tm.result_recorded_at >= tr.started_at
  ),
  fastest AS (SELECT * FROM timed ORDER BY minutes ASC  LIMIT 1),
  slowest AS (SELECT * FROM timed ORDER BY minutes DESC LIMIT 1)
  SELECT
    (SELECT COUNT(*)::INT FROM timed),
    (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)::NUMERIC, 1) FROM timed t),
    (SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)
                   / NULLIF(AVG(t.duration_minutes), 0) * 100)::NUMERIC, 0)
       FROM timed t WHERE t.duration_minutes IS NOT NULL),
    (SELECT COUNT(*)::INT FROM timed t
      WHERE t.duration_minutes IS NOT NULL AND t.minutes >= t.duration_minutes * 0.95),
    (SELECT ROUND(f.minutes::NUMERIC, 1) FROM fastest f),
    (SELECT f.event_name FROM fastest f),
    (SELECT f.opponent_name FROM fastest f),
    (SELECT f.deck_pokemon1 FROM fastest f),
    (SELECT f.deck_pokemon2 FROM fastest f),
    (SELECT f.won FROM fastest f),
    (SELECT ROUND(s.minutes::NUMERIC, 1) FROM slowest s),
    (SELECT s.event_name FROM slowest s),
    (SELECT s.opponent_name FROM slowest s);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_round_health(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_player_pace(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_game_pace(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
