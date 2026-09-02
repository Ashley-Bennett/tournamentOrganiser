-- ── Organiser alert state (2026-09-02) ───────────────────────────────────────
--
-- The notification watcher is fed by get_player_tournament_view, which
-- authenticates the caller *as a player* in the tournament. An organiser is not
-- a player in their own event, so the bell has nothing to say to them.
--
-- This is the other side of it: one row per active tournament the caller helps
-- run, carrying just enough to derive the two events an organiser actually
-- needs — "all results are in for round N" and "N results disagree".
--
-- Deliberately one query for every tournament at once rather than one per
-- tournament like the player watcher: an organiser usually has a single active
-- event, the payload is tiny, and polling one endpoint beats polling five.
--
-- Returns the workspace slug because the organiser's matches page is workspace
-- scoped (/w/:slug/tournaments/:id/matches) and the client cannot build that
-- deep link from a tournament id alone.
--
-- Auth is plain workspace membership, matching get_match_result_reports — the
-- caller can already open the matches page for anything this returns. Note the
-- guard is an EXISTS on workspace_memberships rather than get_workspace_role(),
-- so there is no NULL-role hole to COALESCE around.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_organiser_alert_state()
RETURNS TABLE(
  tournament_id   UUID,
  tournament_name TEXT,
  workspace_slug  TEXT,
  round_number    INTEGER,
  total_matches   INTEGER,
  settled_matches INTEGER,
  conflict_count  INTEGER
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
  -- The round in play is simply the highest one that has been paired.
  latest AS (
    SELECT m.tournament_id, MAX(m.round_number) AS round_number
    FROM public.tournament_matches m
    WHERE m.tournament_id IN (SELECT id FROM mine)
    GROUP BY m.tournament_id
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
    -- Both players reported and the two reports do not describe one result.
    COUNT(*) FILTER (
      WHERE r1.reported_outcome IS NOT NULL
        AND r2.reported_outcome IS NOT NULL
        AND NOT (
             (r1.reported_outcome = 'win'  AND r2.reported_outcome = 'loss')
          OR (r1.reported_outcome = 'loss' AND r2.reported_outcome = 'win')
          OR (r1.reported_outcome = 'draw' AND r2.reported_outcome = 'draw')
        )
    )::INTEGER
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
  GROUP BY mine.id, mine.name, mine.slug, latest.round_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_alert_state() TO authenticated;
