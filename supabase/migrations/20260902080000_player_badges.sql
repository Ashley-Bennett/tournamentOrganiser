-- ============================================================
-- Player badges: derived, not granted (2026-09-02)
--
-- NOT YET ENABLED. Nothing in the app calls this. It ships ahead of the
-- UI so the data model can be built and checked against real history
-- before a single badge is drawn.
--
-- Every launch badge is a pure function of tournament history, so there
-- is no grants table and no reconcile pass: the count is computed on
-- read and cannot drift out of step with the events it describes. A
-- player who links their account a year late collects everything they
-- were already owed, because nothing was ever stored to miss.
--
-- Stored grants only become necessary for badges history cannot
-- describe — closed-set cohorts, and anything an organiser mints by
-- hand. Those get a table when they get built.
--
-- Identity is account-level. workspace_player_identities keys a linked
-- entry by its user_id, and folds same-name walk-in entries in the same
-- workspace into that key — so a regular who played under a bare name
-- for six months and linked in July keeps those six months.
--
-- Performance badges carry the game they were earned in, because a
-- Champion of a chess evening is not a claim about Pokemon and must not
-- show at a Pokemon event. Attendance carries no game: it describes the
-- club, not the play. A NULL game_id therefore means "shows anywhere".
--
-- Thresholds and tier names deliberately live in the frontend registry
-- (src/badges/), not here. This returns an id and a count; the client
-- decides that 25 events makes you a Regular. Adding a badge tier is
-- then a code change rather than a migration.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_badges();

CREATE FUNCTION public.get_my_badges()
RETURNS TABLE(
  badge_id       TEXT,
  badge_count    INT,
  workspace_id   UUID,
  workspace_name TEXT,
  game_id        TEXT
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

  RETURN QUERY
  -- Workspaces this account has ever played in.
  WITH my_workspaces AS (
    SELECT DISTINCT tp.workspace_id AS ws
    FROM public.tournament_players tp
    WHERE tp.user_id = auth.uid()
  ),
  -- Every entry belonging to this account, including same-name walk-ins
  -- folded in by workspace_player_identities. A linked entry is keyed by
  -- its user_id, so our own key is simply the uuid as text.
  mine AS (
    SELECT
      i.tournament_player_id AS tpid,
      i.tournament_id        AS tid,
      w.ws                   AS workspace_id
    FROM my_workspaces w
    CROSS JOIN LATERAL public.workspace_player_identities(w.ws) i
    WHERE i.identity_key = auth.uid()::TEXT
  ),
  -- One row per finished event, with the placement and the size of the
  -- room it was earned in.
  played AS (
    SELECT
      m.tpid,
      m.tid,
      m.workspace_id,
      t.game_id::TEXT  AS game_id,
      ts.position::INT AS finish,
      (
        SELECT COUNT(*)::INT
        FROM public.tournament_players f
        WHERE f.tournament_id = m.tid
      ) AS field_size
    FROM mine m
    JOIN public.tournaments t
      ON t.id = m.tid AND t.status = 'completed'
    LEFT JOIN public.tournament_standings ts
      ON ts.tournament_id = m.tid AND ts.player_id = m.tpid
  ),
  -- The cut is the top eight, or the top four in a room too small for
  -- eight to mean anything.
  --
  -- The eight-player floor is NOT applied here. It belongs to the
  -- placement badges, which need a room big enough for a placing to
  -- mean something — turning up to a six-player evening is still
  -- turning up, and attendance counts it.
  scored AS (
    SELECT
      p.*,
      CASE WHEN p.field_size >= 16 THEN 8 ELSE 4 END AS cut_size
    FROM played p
  ),
  -- Whoever won each event, and who beat them on the way.
  winners AS (
    SELECT ts.tournament_id AS tid, ts.player_id AS winner_id
    FROM public.tournament_standings ts
    WHERE ts.position = 1
  ),
  winner_losses AS (
    SELECT
      w.tid,
      CASE
        WHEN tm.player1_id = w.winner_id THEN tm.player2_id
        ELSE tm.player1_id
      END AS beater
    FROM winners w
    JOIN public.tournament_matches tm
      ON tm.tournament_id = w.tid
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND (tm.player1_id = w.winner_id OR tm.player2_id = w.winner_id)
     AND tm.winner_id IS NOT NULL
     AND tm.winner_id <> w.winner_id
  ),
  -- Spoiler needs the winner to have lost exactly once. If they went
  -- undefeated nobody earns it, which is what keeps it rare.
  sole_losses AS (
    -- HAVING below guarantees exactly one row, so the array has one element.
    -- (MIN() has no uuid overload.)
    SELECT wl.tid, (ARRAY_AGG(wl.beater))[1] AS beater
    FROM winner_losses wl
    GROUP BY wl.tid
    HAVING COUNT(*) = 1
  ),

  -- ── The badges ─────────────────────────────────────────────────────
  -- Attendance is a claim about the place, not the game: being a regular
  -- at a club is true whichever night you come, so it carries no game and
  -- shows at every event.
  attendance AS (
    SELECT
      'attendance'::TEXT AS badge_id,
      COUNT(*)::INT      AS badge_count,
      s.workspace_id,
      (SELECT ws.name FROM public.workspaces ws WHERE ws.id = s.workspace_id)::TEXT AS workspace_name,
      NULL::TEXT         AS game_id
    FROM scored s
    GROUP BY s.workspace_id
  ),
  top_cut AS (
    SELECT 'top_cut'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8
      AND s.finish IS NOT NULL
      AND s.finish <= s.cut_size
    GROUP BY s.game_id
    HAVING COUNT(*) > 0
  ),
  champion AS (
    SELECT 'champion'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8 AND s.finish = 1
    GROUP BY s.game_id
    HAVING COUNT(*) > 0
  ),
  bubble AS (
    SELECT 'bubble'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8 AND s.finish = s.cut_size + 1
    GROUP BY s.game_id
    HAVING COUNT(*) > 0
  ),
  spoiler AS (
    SELECT 'spoiler'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    JOIN sole_losses sl ON sl.tid = s.tid AND sl.beater = s.tpid
    WHERE s.field_size >= 8
    GROUP BY s.game_id
    HAVING COUNT(*) > 0
  )
  SELECT * FROM attendance
  UNION ALL SELECT * FROM top_cut
  UNION ALL SELECT * FROM champion
  UNION ALL SELECT * FROM spoiler
  UNION ALL SELECT * FROM bubble;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_badges() TO authenticated;
