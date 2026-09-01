-- ============================================================
-- Organiser stats: event health (2026-09-01) — Phase 4
--
-- Three things an organiser can act on that nothing in the app
-- currently surfaces:
--
--   * how long rounds actually take, against the round timer they set;
--   * which round people drop in;
--   * how many results players reported themselves rather than the
--     desk typing in — the only direct measure of whether player mode
--     is being used.
-- ============================================================

-- Dropped first so the file re-applies cleanly: CREATE OR REPLACE cannot change
-- a function's return type, and these gained columns during development. DROP
-- also discards the grants, reissued at the end.
DROP FUNCTION IF EXISTS public.get_organiser_round_health(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_organiser_reporting_health(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_round_health
--
-- A round's length is measured from when its pairings were written
-- (MIN(created_at) over the round's matches) to when the last result landed
-- (MAX(updated_at)). That is a proxy, not a stopwatch, and it is wrong in one
-- specific way: a tournament abandoned mid-round and finished the next morning
-- reports a round that took eighteen hours.
--
-- So a round only contributes to the timing if it lasted between one minute and
-- twelve hours. Rounds outside that are still counted in `matches`; they are
-- excluded from the averages, and `timed_rounds` says how many actually fed
-- them, so a thin or unusable sample is visible rather than silently averaged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_round_health(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT        DEFAULT NULL
)
RETURNS TABLE(
  round_number    INT,
  events          INT,
  matches         INT,
  timed_rounds    INT,
  avg_minutes     NUMERIC,
  median_minutes  NUMERIC,
  drops_at_round  INT
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
  round_spans AS (
    SELECT
      tm.tournament_id,
      tm.round_number::INT AS rnd,
      COUNT(*)::INT        AS n_matches,
      EXTRACT(EPOCH FROM (MAX(tm.updated_at) - MIN(tm.created_at))) / 60.0 AS minutes
    FROM public.tournament_matches tm
    JOIN chosen_events ce ON ce.tid = tm.tournament_id
    WHERE tm.status IN ('completed', 'bye')
    GROUP BY tm.tournament_id, tm.round_number
  ),
  timed AS (
    SELECT rs.*, (rs.minutes BETWEEN 1 AND 720) AS usable
    FROM round_spans rs
  ),
  drops AS (
    SELECT
      tp.dropped_at_round::INT AS rnd,
      COUNT(*)::INT            AS n
    FROM public.tournament_players tp
    JOIN chosen_events ce ON ce.tid = tp.tournament_id
    WHERE tp.dropped AND tp.dropped_at_round IS NOT NULL
    GROUP BY tp.dropped_at_round
  )
  SELECT
    t.rnd,
    COUNT(DISTINCT t.tournament_id)::INT,
    SUM(t.n_matches)::INT,
    COUNT(*) FILTER (WHERE t.usable)::INT,
    ROUND(AVG(t.minutes) FILTER (WHERE t.usable), 1),
    ROUND(
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY CASE WHEN t.usable THEN t.minutes END
      )::NUMERIC,
      1
    ),
    COALESCE(MAX(d.n), 0)
  FROM timed t
  LEFT JOIN drops d ON d.rnd = t.rnd
  GROUP BY t.rnd
  ORDER BY t.rnd;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_reporting_health
--
-- Who actually entered the results. confirmed_by is 'player_report' when a
-- player's submission was accepted, 'organiser' when the desk entered it, and
-- NULL for anything recorded before the column existed — reported separately
-- rather than folded into the organiser count, which would overstate the desk's
-- share for any workspace with history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_reporting_health(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT        DEFAULT NULL
)
RETURNS TABLE(
  total_results         INT,
  player_reported       INT,
  organiser_entered     INT,
  unattributed          INT,
  reports_submitted     INT,
  awaiting_confirmation INT
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
  results AS (
    SELECT tm.id, tm.confirmed_by
    FROM public.tournament_matches tm
    JOIN chosen_events ce ON ce.tid = tm.tournament_id
    -- Byes are not reported by anyone, so they would only dilute the split.
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
  )
  SELECT
    (SELECT COUNT(*)::INT FROM results),
    (SELECT COUNT(*)::INT FROM results r WHERE r.confirmed_by = 'player_report'),
    (SELECT COUNT(*)::INT FROM results r WHERE r.confirmed_by = 'organiser'),
    (SELECT COUNT(*)::INT FROM results r WHERE r.confirmed_by IS NULL),
    (SELECT COUNT(*)::INT
       FROM public.match_result_reports mrr
      WHERE mrr.match_id IN (SELECT r.id FROM results r)),
    -- A player has reported a result that nobody has confirmed yet. Not a
    -- health statistic so much as a to-do: these are matches sitting in a
    -- pending state waiting on the desk.
    (SELECT COUNT(*)::INT
       FROM public.tournament_matches tm
       JOIN chosen_events ce ON ce.tid = tm.tournament_id
      WHERE tm.status = 'pending'
        AND tm.confirmed_by = 'player_report');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_round_health(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_reporting_health(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
