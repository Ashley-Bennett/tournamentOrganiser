-- ============================================================
-- Organiser stats: league table (2026-09-01) — Phase 2
--
-- A running league across several events, so a club can hold a
-- season without tracking it in a spreadsheet. Two scores, side by
-- side, because the two questions are different:
--
--   * match points  — summed tournament_standings.match_points. The
--     same number the tournament itself scored with, so the league is
--     consistent with the standings players already saw. Rewards
--     turning up and grinding wins.
--   * placement points — points for where you finished, from a scheme
--     the caller passes in. Rewards actually winning events.
--
-- Placement points are only awarded for COMPLETED events: `position`
-- is not final until the last round is in, and half-scoring an active
-- event would let a league lead evaporate on the final pairing. Match
-- points do accrue from an event in progress, which is what makes it
-- a running league rather than a retrospective one.
--
-- The scheme is a parameter rather than a column: a workspace-level
-- setting would need a settings UI and a schema change before a single
-- table could render, and the caller passing an array covers presets
-- and a custom scheme equally well.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_league_table
--
-- Events are chosen either explicitly (p_tournament_ids) or by falling back to
-- the date window and game filter every other organiser RPC uses. The explicit
-- list wins when given, and is still intersected with the workspace so a caller
-- cannot pull in an event from somewhere else by passing its id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_league_table(
  p_workspace_id     UUID,
  p_tournament_ids   UUID[]      DEFAULT NULL,
  p_from             TIMESTAMPTZ DEFAULT NULL,
  p_to               TIMESTAMPTZ DEFAULT NULL,
  p_game_id          TEXT        DEFAULT NULL,
  p_placement_points INT[]       DEFAULT ARRAY[10, 8, 6, 5, 4, 3, 2, 1]
)
RETURNS TABLE(
  identity_key     TEXT,
  display_name     TEXT,
  is_linked        BOOLEAN,
  events_played    INT,
  match_points     INT,
  placement_points INT,
  total_points     INT,
  wins             INT,
  losses           INT,
  draws            INT,
  byes             INT,
  matches_played   INT,
  best_finish      INT,
  event_wins       INT
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
  WITH chosen AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (
      -- Explicit selection, intersected with the workspace by construction:
      -- workspace_player_identities only ever returns this workspace's rows.
      p_tournament_ids IS NOT NULL
        AND i.tournament_id = ANY(p_tournament_ids)
    )
    OR (
      p_tournament_ids IS NULL
        AND (p_game_id IS NULL OR i.game_id = p_game_id)
        AND (p_from IS NULL OR i.played_at >= p_from)
        AND (p_to   IS NULL OR i.played_at <  p_to)
    )
  ),
  scored AS (
    SELECT
      c.identity_key AS ikey,
      c.display_name AS name,
      c.is_linked    AS linked,
      c.tournament_id,
      t.status                         AS event_status,
      COALESCE(ts.match_points, 0)     AS mp,
      COALESCE(ts.wins, 0)             AS w,
      COALESCE(ts.losses, 0)           AS l,
      COALESCE(ts.draws, 0)            AS d,
      COALESCE(ts.byes_received, 0)    AS b,
      COALESCE(ts.matches_played, 0)   AS mplayed,
      ts.position,
      -- Placement points: completed events only, and only for a position the
      -- scheme actually covers. A 12th place in an 8-deep scheme scores zero
      -- rather than erroring on the array index.
      CASE
        WHEN t.status = 'completed'
         AND ts.position IS NOT NULL
         AND ts.position >= 1
         AND ts.position <= COALESCE(ARRAY_LENGTH(p_placement_points, 1), 0)
        THEN p_placement_points[ts.position]
        ELSE 0
      END AS pp
    FROM chosen c
    JOIN public.tournaments t ON t.id = c.tournament_id
    LEFT JOIN public.tournament_standings ts
      ON ts.tournament_id = c.tournament_id
     AND ts.player_id     = c.tournament_player_id
  )
  SELECT
    s.ikey,
    MAX(s.name),
    BOOL_OR(s.linked),
    COUNT(DISTINCT s.tournament_id)::INT,
    SUM(s.mp)::INT,
    SUM(s.pp)::INT,
    (SUM(s.mp) + SUM(s.pp))::INT,
    SUM(s.w)::INT,
    SUM(s.l)::INT,
    SUM(s.d)::INT,
    SUM(s.b)::INT,
    SUM(s.mplayed)::INT,
    MIN(s.position) FILTER (WHERE s.event_status = 'completed')::INT,
    COUNT(*) FILTER (WHERE s.event_status = 'completed' AND s.position = 1)::INT
  FROM scored s
  GROUP BY s.ikey
  ORDER BY
    (SUM(s.mp) + SUM(s.pp)) DESC,
    SUM(s.mp) DESC,
    MIN(s.position) FILTER (WHERE s.event_status = 'completed') ASC NULLS LAST,
    MAX(s.name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_league_table(UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT[]) TO authenticated;
