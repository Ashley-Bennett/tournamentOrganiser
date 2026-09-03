-- ============================================================
-- Badge counts for many players, and the cards for one event (2026-09-02)
--
-- NOT YET ENABLED. Nothing calls either of these.
--
-- get_my_badges answered "what have I earned". The pairing board asks a
-- different question — "what do these thirty-two people have on their
-- cards" — and asks it on behalf of a device-token player with no
-- account at all.
--
-- So the derivation moves into badge_counts(user_ids), and get_my_badges
-- becomes a thin wrapper over it. One place decides what a Champion is;
-- otherwise the board and the account page would drift apart and only
-- disagree in front of a room.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- badge_counts
--
-- Every badge held by each of the given accounts, as a count. Internal: it
-- performs no authorisation of its own, so every caller must do that first.
-- Not granted to any role.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.badge_counts(p_user_ids UUID[])
RETURNS TABLE(
  user_id        UUID,
  badge_id       TEXT,
  badge_count    INT,
  workspace_id   UUID,
  workspace_name TEXT,
  game_id        TEXT
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
  -- Every entry belonging to each account, including same-name walk-ins
  -- folded in by workspace_player_identities: a linked entry is keyed by its
  -- user_id, so an account's own key is the uuid as text.
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
  -- The cut is the top eight, or the top four in a room too small for eight
  -- to mean anything. The eight-player floor is applied per badge below, not
  -- here: turning up to a six-player evening is still turning up.
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
  -- Spoiler needs the winner to have lost exactly once. If they went
  -- undefeated nobody earns it, which is what keeps it rare. HAVING
  -- guarantees one row, so the array has one element (MIN has no uuid
  -- overload).
  sole_losses AS (
    SELECT wl.tid, (ARRAY_AGG(wl.beater))[1] AS beater
    FROM winner_losses wl
    GROUP BY wl.tid
    HAVING COUNT(*) = 1
  ),

  -- Attendance describes the club, not the game: being a regular is true
  -- whichever night you come, so it carries no game and shows everywhere.
  attendance AS (
    SELECT
      s.uid,
      'attendance'::TEXT AS badge_id,
      COUNT(*)::INT      AS badge_count,
      s.workspace_id,
      (SELECT ws.name FROM public.workspaces ws WHERE ws.id = s.workspace_id)::TEXT AS workspace_name,
      NULL::TEXT         AS game_id
    FROM scored s
    GROUP BY s.uid, s.workspace_id
  ),
  top_cut AS (
    SELECT s.uid, 'top_cut'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8
      AND s.finish IS NOT NULL
      AND s.finish <= s.cut_size
    GROUP BY s.uid, s.game_id
  ),
  champion AS (
    SELECT s.uid, 'champion'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8 AND s.finish = 1
    GROUP BY s.uid, s.game_id
  ),
  bubble AS (
    SELECT s.uid, 'bubble'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8 AND s.finish = s.cut_size + 1
    GROUP BY s.uid, s.game_id
  ),
  spoiler AS (
    SELECT s.uid, 'spoiler'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    JOIN sole_losses sl ON sl.tid = s.tid AND sl.beater = s.tpid
    WHERE s.field_size >= 8
    GROUP BY s.uid, s.game_id
  )
  SELECT * FROM attendance
  UNION ALL SELECT * FROM top_cut
  UNION ALL SELECT * FROM champion
  UNION ALL SELECT * FROM spoiler
  UNION ALL SELECT * FROM bubble;
$$;

REVOKE ALL ON FUNCTION public.badge_counts(UUID[]) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_my_badges — now a wrapper, so there is one definition of a Champion.
-- ─────────────────────────────────────────────────────────────────────────────
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
  SELECT b.badge_id, b.badge_count, b.workspace_id, b.workspace_name, b.game_id
  FROM public.badge_counts(ARRAY[auth.uid()]) b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_badges() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_tournament_player_cards
--
-- What to draw beside each name on the pairing board.
--
-- Readable by anyone who can already see the pairings, which is the same
-- test tournament_matches_select_anon applies: once a round is published it
-- is on a projector in a room, and a player's chosen title and partner are
-- exactly as public as the pairing itself. Before that, workspace members
-- only.
--
-- Only accounts have cards. An accountless walk-in returns no row, and the
-- board shows their name alone — which is the account-level badge model
-- working as intended rather than a gap.
--
-- Counts come back with each slot so the client can resolve the tier without
-- a second call. Only equipped badges are counted; deriving all five for
-- thirty-two players to show three would be wasteful.
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
  counts AS (
    SELECT * FROM public.badge_counts(
      ARRAY(SELECT e.uid FROM entrants e)
    )
  ),
  equipped AS (
    SELECT
      e.tpid,
      s.slot,
      s.badge_id,
      s.workspace_id,
      COALESCE(c.badge_count, 0) AS badge_count,
      c.workspace_name
    FROM entrants e
    JOIN public.player_card_slot s
      ON s.user_id = e.uid AND s.game_id = v_game_id
    LEFT JOIN counts c
      ON c.user_id = e.uid
     AND c.badge_id = s.badge_id
     -- A per-league badge is only that league's; a system badge has no
     -- workspace on either side.
     AND c.workspace_id IS NOT DISTINCT FROM s.workspace_id
     -- A per-game badge only counts for this event's game; a game-agnostic
     -- one carries no game and counts anywhere. Without this a player with
     -- top cuts in two games matched both rows and appeared twice.
     AND (c.game_id IS NULL OR c.game_id = v_game_id)
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
