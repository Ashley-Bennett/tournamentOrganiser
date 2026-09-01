-- ============================================================
-- Organiser stats: deck drill-down (2026-09-01) — Phase 5
--
-- The meta share table answers "what was played". These answer the
-- next question a organiser always asks about a row in it: who was
-- playing it, and at which events.
--
-- Both take the same event scoping as get_organiser_meta_share, so a
-- drill-down describes exactly the events the table above it did.
-- Deck slots are matched with IS NOT DISTINCT FROM: a deck can
-- legitimately have a NULL second slot, and = would drop those rows.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_deck_pilots
-- Who played this deck, best record first.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_deck_pilots(
  p_workspace_id   UUID,
  p_deck_pokemon1  INT         DEFAULT NULL,
  p_deck_pokemon2  INT         DEFAULT NULL,
  p_tournament_ids UUID[]      DEFAULT NULL,
  p_from           TIMESTAMPTZ DEFAULT NULL,
  p_to             TIMESTAMPTZ DEFAULT NULL,
  p_game_id        TEXT        DEFAULT NULL
)
RETURNS TABLE(
  identity_key  TEXT,
  display_name  TEXT,
  is_linked     BOOLEAN,
  entries       INT,
  match_wins    INT,
  total_matches INT,
  best_finish   INT,
  event_wins    INT,
  first_used    TIMESTAMPTZ,
  last_used     TIMESTAMPTZ
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
      p_tournament_ids IS NOT NULL AND i.tournament_id = ANY(p_tournament_ids)
    )
    OR (
      p_tournament_ids IS NULL
        AND (p_game_id IS NULL OR i.game_id = p_game_id)
        AND (p_from IS NULL OR i.played_at >= p_from)
        AND (p_to   IS NULL OR i.played_at <  p_to)
    )
  ),
  decked AS (
    SELECT
      c.tournament_player_id AS tpid,
      c.tournament_id        AS tid,
      c.identity_key         AS ikey,
      c.display_name         AS name,
      c.is_linked            AS linked,
      c.played_at
    FROM chosen c
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE tp.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
      AND tp.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
  ),
  match_stats AS (
    SELECT
      d.ikey,
      COUNT(tm.id)::INT AS n_matches,
      COUNT(tm.id) FILTER (
        WHERE tm.status = 'bye'
           OR (tm.status = 'completed' AND tm.winner_id = d.tpid)
      )::INT AS n_wins
    FROM decked d
    JOIN public.tournament_matches tm
      ON tm.tournament_id = d.tid
     AND (tm.player1_id = d.tpid OR tm.player2_id = d.tpid)
     AND tm.status IN ('completed', 'bye')
    GROUP BY d.ikey
  ),
  finishes AS (
    SELECT
      d.ikey,
      MIN(ts.position)::INT                        AS best_pos,
      COUNT(*) FILTER (WHERE ts.position = 1)::INT AS n_event_wins
    FROM decked d
    JOIN public.tournaments t ON t.id = d.tid AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = d.tid AND ts.player_id = d.tpid
    GROUP BY d.ikey
  ),
  summary AS (
    SELECT
      d.ikey,
      MAX(d.name)      AS name,
      BOOL_OR(d.linked) AS linked,
      COUNT(*)::INT    AS n_entries,
      MIN(d.played_at) AS first_at,
      MAX(d.played_at) AS last_at
    FROM decked d
    GROUP BY d.ikey
  )
  SELECT
    s.ikey,
    s.name,
    s.linked,
    s.n_entries,
    COALESCE(ms.n_wins, 0),
    COALESCE(ms.n_matches, 0),
    f.best_pos,
    COALESCE(f.n_event_wins, 0),
    s.first_at,
    s.last_at
  FROM summary s
  LEFT JOIN match_stats ms ON ms.ikey = s.ikey
  LEFT JOIN finishes    f  ON f.ikey  = s.ikey
  ORDER BY s.n_entries DESC, COALESCE(ms.n_wins, 0) DESC, s.name;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_deck_events
-- Where this deck turned up, newest first: how many copies were in the room and
-- how the best copy finished.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_deck_events(
  p_workspace_id   UUID,
  p_deck_pokemon1  INT         DEFAULT NULL,
  p_deck_pokemon2  INT         DEFAULT NULL,
  p_tournament_ids UUID[]      DEFAULT NULL,
  p_from           TIMESTAMPTZ DEFAULT NULL,
  p_to             TIMESTAMPTZ DEFAULT NULL,
  p_game_id        TEXT        DEFAULT NULL
)
RETURNS TABLE(
  tournament_id   UUID,
  tournament_name TEXT,
  played_at       TIMESTAMPTZ,
  event_status    TEXT,
  copies          INT,
  field_size      INT,
  best_finish     INT,
  match_wins      INT,
  total_matches   INT
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
      p_tournament_ids IS NOT NULL AND i.tournament_id = ANY(p_tournament_ids)
    )
    OR (
      p_tournament_ids IS NULL
        AND (p_game_id IS NULL OR i.game_id = p_game_id)
        AND (p_from IS NULL OR i.played_at >= p_from)
        AND (p_to   IS NULL OR i.played_at <  p_to)
    )
  ),
  decked AS (
    SELECT
      c.tournament_player_id AS tpid,
      c.tournament_id        AS tid,
      c.played_at
    FROM chosen c
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE tp.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
      AND tp.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
  ),
  per_event AS (
    SELECT
      d.tid,
      MIN(d.played_at)  AS played_at,
      COUNT(*)::INT     AS copies
    FROM decked d
    GROUP BY d.tid
  ),
  match_stats AS (
    SELECT
      d.tid,
      COUNT(tm.id)::INT AS n_matches,
      COUNT(tm.id) FILTER (
        WHERE tm.status = 'bye'
           OR (tm.status = 'completed' AND tm.winner_id = d.tpid)
      )::INT AS n_wins
    FROM decked d
    JOIN public.tournament_matches tm
      ON tm.tournament_id = d.tid
     AND (tm.player1_id = d.tpid OR tm.player2_id = d.tpid)
     AND tm.status IN ('completed', 'bye')
    GROUP BY d.tid
  ),
  best AS (
    SELECT d.tid, MIN(ts.position)::INT AS best_pos
    FROM decked d
    JOIN public.tournament_standings ts
      ON ts.tournament_id = d.tid AND ts.player_id = d.tpid
    GROUP BY d.tid
  ),
  field AS (
    SELECT ts.tournament_id AS tid, COUNT(*)::INT AS n
    FROM public.tournament_standings ts
    GROUP BY ts.tournament_id
  )
  SELECT
    pe.tid,
    t.name,
    pe.played_at,
    t.status,
    pe.copies,
    COALESCE(fl.n, 0),
    b.best_pos,
    COALESCE(ms.n_wins, 0),
    COALESCE(ms.n_matches, 0)
  FROM per_event pe
  JOIN public.tournaments t ON t.id = pe.tid
  LEFT JOIN match_stats ms ON ms.tid = pe.tid
  LEFT JOIN best        b  ON b.tid  = pe.tid
  LEFT JOIN field       fl ON fl.tid = pe.tid
  ORDER BY pe.played_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_deck_pilots(UUID, INT, INT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_deck_events(UUID, INT, INT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
