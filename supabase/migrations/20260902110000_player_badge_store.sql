-- ============================================================
-- Saved badges (2026-09-02)
--
-- NOT YET ENABLED. Nothing calls these.
--
-- Badges were derived on read, which was tidy until the pairing board
-- needed them. The board is a projector in a room and the people
-- looking at it are mostly not logged in, but the identity matching
-- that derivation depends on refuses to run without a login — it is a
-- member-facing helper and rightly checks.
--
-- Saving the result fixes that by making the derivation only ever
-- happen where it is allowed: a logged-in person, about themselves.
-- The board then reads rows and works nothing out, so no anonymous
-- reader ever reaches the identity matching.
--
-- It also buys the thing derivation could not: when you earned it. A
-- badge case that says "8 events, first on 12 March, latest on 30
-- August" needs dates that recomputing a count cannot give you.
--
-- Still not a grant table in the old sense. Everything here is
-- recomputed wholesale from history by refresh_my_badges, so it cannot
-- drift: a wrong row is fixed by running it again, and a player who
-- links an account a year late collects everything on the first
-- refresh.
--
-- earned_at holds the date of every qualifying event rather than the
-- tier dates, because the database does not know that 25 events makes
-- you a Regular — thresholds live in the frontend registry on purpose.
-- The client reads the 25th date to say when Silver was reached. The
-- database keeps facts; the registry keeps meaning.
--
-- Accountless and organiser-added players have no rows and no badges.
-- That is the account-level model working, not a gap: claiming an
-- account is how you collect them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.player_badge (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id     TEXT NOT NULL,
  -- NULL for a badge that is not tied to one league.
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- NULL for a badge that shows whatever is being played.
  game_id      TEXT,
  badge_count  INT  NOT NULL DEFAULT 0,
  -- Ascending ISO dates, one per qualifying event, newest last. Capped so a
  -- decade of attendance cannot grow a row without bound.
  earned_at    JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULLS NOT DISTINCT so a system badge (no workspace, no game) is one row
  -- rather than one per refresh. Postgres 15+.
  UNIQUE NULLS NOT DISTINCT (user_id, badge_id, workspace_id, game_id)
);

CREATE INDEX IF NOT EXISTS player_badge_user_idx
  ON public.player_badge (user_id);

ALTER TABLE public.player_badge ENABLE ROW LEVEL SECURITY;

-- Read your own. Writes happen only through refresh_my_badges, which is
-- SECURITY DEFINER, so there is deliberately no insert or update policy: a
-- client must not be able to award itself a badge.
DROP POLICY IF EXISTS player_badge_read_own ON public.player_badge;
CREATE POLICY player_badge_read_own ON public.player_badge
  FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT ON public.player_badge TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- badge_events
--
-- Every qualifying event for each badge, per account, with its date. The
-- counting version of this is just a COUNT over the same rows, so keeping one
-- definition here stops the board and the badge case disagreeing.
--
-- Internal: authorises nothing. Callers must do that first.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.badge_events(p_user_ids UUID[])
RETURNS TABLE(
  user_id      UUID,
  badge_id     TEXT,
  workspace_id UUID,
  game_id      TEXT,
  played_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH uw AS (
    SELECT DISTINCT tp.user_id AS uid, tp.workspace_id AS ws
    FROM public.tournament_players tp
    WHERE tp.user_id = ANY(p_user_ids)
  ),
  mine AS (
    SELECT
      uw.uid,
      i.tournament_player_id AS tpid,
      i.tournament_id        AS tid,
      uw.ws                  AS workspace_id
    FROM uw
    CROSS JOIN LATERAL public.workspace_player_identities(uw.ws) i
    WHERE i.identity_key = uw.uid::TEXT
  ),
  played AS (
    SELECT
      m.uid,
      m.tpid,
      m.tid,
      m.workspace_id,
      t.game_id::TEXT                     AS game_id,
      COALESCE(t.starts_at, t.created_at) AS played_at,
      ts.position::INT                    AS finish,
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
  scored AS (
    SELECT p.*, CASE WHEN p.field_size >= 16 THEN 8 ELSE 4 END AS cut_size
    FROM played p
  ),
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
  sole_losses AS (
    SELECT wl.tid, (ARRAY_AGG(wl.beater))[1] AS beater
    FROM winner_losses wl
    GROUP BY wl.tid
    HAVING COUNT(*) = 1
  )
  -- Attendance describes the club, not the game, so it carries a workspace
  -- and no game. Everything else is the reverse.
  SELECT s.uid, 'attendance'::TEXT, s.workspace_id, NULL::TEXT, s.played_at
  FROM scored s
  UNION ALL
  SELECT s.uid, 'top_cut'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  WHERE s.field_size >= 8 AND s.finish IS NOT NULL AND s.finish <= s.cut_size
  UNION ALL
  SELECT s.uid, 'champion'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  WHERE s.field_size >= 8 AND s.finish = 1
  UNION ALL
  SELECT s.uid, 'bubble'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  WHERE s.field_size >= 8 AND s.finish = s.cut_size + 1
  UNION ALL
  SELECT s.uid, 'spoiler'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  JOIN sole_losses sl ON sl.tid = s.tid AND sl.beater = s.tpid
  WHERE s.field_size >= 8;
$$;

REVOKE ALL ON FUNCTION public.badge_events(UUID[]) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- refresh_my_badges
--
-- Recomputes the caller's saved badges from history, wholesale. Safe to run
-- as often as you like: it replaces rather than accumulates, so a bad row is
-- fixed by running it again.
--
-- The client calls this for a signed-in player. Nobody else's badges can be
-- touched, and nothing here trusts a value sent from a browser.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_my_badges()
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH fresh AS (
    SELECT
      e.user_id,
      e.badge_id,
      e.workspace_id,
      e.game_id,
      COUNT(*)::INT AS badge_count,
      -- Capped: a decade of weekly attendance is ~500 dates and the badge
      -- case only ever reads the ones a threshold lands on.
      TO_JSONB(
        (ARRAY_AGG(e.played_at ORDER BY e.played_at))[1:200]
      ) AS earned_at
    FROM public.badge_events(ARRAY[auth.uid()]) e
    GROUP BY e.user_id, e.badge_id, e.workspace_id, e.game_id
  ),
  wiped AS (
    -- Anything no longer earned — an event deleted, a merge undone — must go,
    -- or a stale row would outlive the history that justified it.
    DELETE FROM public.player_badge pb
    WHERE pb.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM fresh f
        WHERE f.badge_id = pb.badge_id
          AND f.workspace_id IS NOT DISTINCT FROM pb.workspace_id
          AND f.game_id      IS NOT DISTINCT FROM pb.game_id
      )
    RETURNING 1
  ),
  written AS (
    INSERT INTO public.player_badge
      (user_id, badge_id, workspace_id, game_id, badge_count, earned_at, updated_at)
    SELECT f.user_id, f.badge_id, f.workspace_id, f.game_id, f.badge_count, f.earned_at, NOW()
    FROM fresh f
    ON CONFLICT (user_id, badge_id, workspace_id, game_id) DO UPDATE
      SET badge_count = EXCLUDED.badge_count,
          earned_at   = EXCLUDED.earned_at,
          updated_at  = NOW()
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_rows FROM written;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_my_badges() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_tournament_player_cards — now reads saved rows.
--
-- The whole point of saving them: this runs for a projector and for phones
-- with no account, so it must not touch the identity matching, which is
-- member-only and rightly refuses. It reads player_badge instead and works
-- nothing out.
--
-- A player who has never refreshed has no rows and shows a bare name, which
-- is the same as an accountless walk-in and degrades quietly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tournament_player_cards(
  p_tournament_id UUID
)
RETURNS TABLE(
  tournament_player_id UUID,
  partner_key          TEXT,
  slots                JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_game_id      TEXT;
  v_public       BOOLEAN;
BEGIN
  SELECT t.workspace_id, t.game_id::TEXT
    INTO v_workspace_id, v_game_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'No such tournament';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.pairings_published = true
  ) INTO v_public;

  -- Once a round is on the board, the badges beside the names are as public
  -- as the pairing itself. Before that, members only.
  IF NOT v_public AND public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not visible';
  END IF;

  RETURN QUERY
  WITH entrants AS (
    SELECT tp.id AS tpid, tp.user_id AS uid
    FROM public.tournament_players tp
    WHERE tp.tournament_id = p_tournament_id
      AND tp.user_id IS NOT NULL
  ),
  equipped AS (
    SELECT
      e.tpid,
      s.slot,
      s.badge_id,
      s.workspace_id,
      COALESCE(pb.badge_count, 0) AS badge_count,
      (SELECT w.name FROM public.workspaces w WHERE w.id = s.workspace_id)::TEXT AS workspace_name
    FROM entrants e
    JOIN public.player_card_slot s
      ON s.user_id = e.uid AND s.game_id = v_game_id
    LEFT JOIN public.player_badge pb
      ON pb.user_id      = e.uid
     AND pb.badge_id     = s.badge_id
     AND pb.workspace_id IS NOT DISTINCT FROM s.workspace_id
     -- A per-game badge counts only for this event's game; a game-agnostic
     -- one carries no game and counts anywhere. Without this, a player with
     -- top cuts in two games matched both rows and appeared twice.
     AND (pb.game_id IS NULL OR pb.game_id = v_game_id)
  )
  SELECT
    e.tpid,
    (
      SELECT pc.partner_key
      FROM public.player_card pc
      WHERE pc.user_id = e.uid AND pc.game_id = v_game_id
    )::TEXT,
    COALESCE(
      (
        SELECT JSONB_AGG(
                 JSONB_BUILD_OBJECT(
                   'slot', q.slot,
                   'badgeId', q.badge_id,
                   'workspaceId', q.workspace_id,
                   'workspaceName', q.workspace_name,
                   'count', q.badge_count
                 )
                 ORDER BY q.slot
               )
        FROM equipped q
        WHERE q.tpid = e.tpid
      ),
      '[]'::JSONB
    )
  FROM entrants e;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_player_cards(UUID) TO authenticated, anon;
