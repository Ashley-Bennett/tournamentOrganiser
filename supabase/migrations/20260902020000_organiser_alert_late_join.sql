-- ── Organiser alert state: late joins (2026-09-02) ───────────────────────────
--
-- notify_late_join already pushes to the organiser's device when someone adds
-- themselves mid-tournament. That push is all there is: once it is dismissed
-- there is no record, and an organiser who was not holding their phone never
-- learns that the round's pairings changed underneath them.
--
-- This adds the same signal to the in-app inbox by extending the alert state
-- with a count and the most recent entrant, so the client can raise one
-- notification per new arrival.
--
-- Self-joins only (created_by IS NULL), matching the trigger's rule — an
-- organiser who added the player themselves does not need telling.
--
-- Adding columns to a RETURNS TABLE means dropping and recreating; the body is
-- otherwise unchanged from 20260902010000.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_organiser_alert_state();

CREATE FUNCTION public.get_organiser_alert_state()
RETURNS TABLE(
  tournament_id     UUID,
  tournament_name   TEXT,
  workspace_slug    TEXT,
  round_number      INTEGER,
  total_matches     INTEGER,
  settled_matches   INTEGER,
  conflict_count    INTEGER,
  late_entries      INTEGER,
  latest_late_name  TEXT,
  latest_late_round INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT t.id, t.name, w.slug
    FROM public.tournaments t
    JOIN public.workspaces w
      ON w.id = t.workspace_id
    WHERE t.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.workspace_memberships wm
        WHERE wm.workspace_id = t.workspace_id
          AND wm.user_id = auth.uid()
      )
  ),
  latest AS (
    SELECT m.tournament_id, MAX(m.round_number) AS round_number
    FROM public.tournament_matches m
    WHERE m.tournament_id IN (SELECT id FROM mine)
    GROUP BY m.tournament_id
  ),
  late AS (
    SELECT
      p.tournament_id,
      COUNT(*)::INTEGER AS late_entries,
      (ARRAY_AGG(p.name ORDER BY p.created_at DESC))[1]::TEXT AS latest_name,
      (ARRAY_AGG(p.late_entry_round ORDER BY p.created_at DESC))[1] AS latest_round
    FROM public.tournament_players p
    WHERE p.tournament_id IN (SELECT id FROM mine)
      AND p.is_late_entry
      AND p.created_by IS NULL
    GROUP BY p.tournament_id
  )
  SELECT
    mine.id,
    mine.name::TEXT,
    mine.slug::TEXT,
    latest.round_number,
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (
      WHERE m.status IN ('completed', 'bye')
    )::INTEGER,
    COUNT(*) FILTER (
      WHERE r1.reported_outcome IS NOT NULL
        AND r2.reported_outcome IS NOT NULL
        AND NOT (
             (r1.reported_outcome = 'win'  AND r2.reported_outcome = 'loss')
          OR (r1.reported_outcome = 'loss' AND r2.reported_outcome = 'win')
          OR (r1.reported_outcome = 'draw' AND r2.reported_outcome = 'draw')
        )
    )::INTEGER,
    COALESCE(MAX(late.late_entries), 0)::INTEGER,
    MAX(late.latest_name)::TEXT,
    MAX(late.latest_round)::INTEGER
  FROM mine
  JOIN latest
    ON latest.tournament_id = mine.id
  JOIN public.tournament_matches m
    ON m.tournament_id = mine.id
   AND m.round_number = latest.round_number
  LEFT JOIN public.match_result_reports r1
    ON r1.match_id = m.id AND r1.player_id = m.player1_id
  LEFT JOIN public.match_result_reports r2
    ON r2.match_id = m.id AND r2.player_id = m.player2_id
  LEFT JOIN late
    ON late.tournament_id = mine.id
  GROUP BY mine.id, mine.name, mine.slug, latest.round_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_alert_state() TO authenticated;
