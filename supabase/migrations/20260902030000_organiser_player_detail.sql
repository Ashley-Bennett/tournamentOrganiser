-- ============================================================
-- Organiser stats: player drill-down (2026-09-02)
--
-- The league table answers "who turns up and does well". These answer
-- the next question about a row in it: who is this person, what do they
-- bring, where have they played, and who do they keep running into.
--
-- The mirror image of get_organiser_deck_pilots — same event scoping,
-- same auth, same identity resolution — so a player drill-down and a
-- deck drill-down describe the same set of events and reconcile with
-- the table they were opened from.
--
-- Identity is workspace_player_identities throughout: a regular entered
-- under three spellings is one person here, and the head-to-head table
-- resolves both sides of every match through it, so a rivalry is not
-- split across spellings either.
--
-- A draw is status = 'completed' with no winner_id, matching every
-- other stats RPC in the codebase.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_player_summary
-- The header. Exists so a deep link can open a player cold, without the
-- league-table row that would otherwise supply these numbers.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_player_summary(
  p_workspace_id   UUID,
  p_identity_key   TEXT,
  p_tournament_ids UUID[]      DEFAULT NULL,
  p_from           TIMESTAMPTZ DEFAULT NULL,
  p_to             TIMESTAMPTZ DEFAULT NULL,
  p_game_id        TEXT        DEFAULT NULL
)
RETURNS TABLE(
  display_name   TEXT,
  is_linked      BOOLEAN,
  events_played  INT,
  wins           INT,
  losses         INT,
  draws          INT,
  byes           INT,
  matches_played INT,
  best_finish    INT,
  event_wins     INT,
  first_seen     TIMESTAMPTZ,
  last_seen      TIMESTAMPTZ
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
  mine AS (
    SELECT c.*, t.status AS event_status
    FROM chosen c
    JOIN public.tournaments t ON t.id = c.tournament_id
    WHERE c.identity_key = p_identity_key
  )
  SELECT
    MAX(m.display_name)::TEXT,
    BOOL_OR(m.is_linked),
    COUNT(DISTINCT m.tournament_id)::INT,
    COALESCE(SUM(ts.wins), 0)::INT,
    COALESCE(SUM(ts.losses), 0)::INT,
    COALESCE(SUM(ts.draws), 0)::INT,
    COALESCE(SUM(ts.byes_received), 0)::INT,
    COALESCE(SUM(ts.matches_played), 0)::INT,
    MIN(ts.position) FILTER (WHERE m.event_status = 'completed')::INT,
    COUNT(*) FILTER (
      WHERE m.event_status = 'completed' AND ts.position = 1
    )::INT,
    MIN(m.played_at),
    MAX(m.played_at)
  FROM mine m
  LEFT JOIN public.tournament_standings ts
    ON ts.tournament_id = m.tournament_id
   AND ts.player_id     = m.tournament_player_id
  HAVING COUNT(*) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_player_summary(
  UUID, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_player_decks
-- What they bring. One row per deck, most-played first.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_player_decks(
  p_workspace_id   UUID,
  p_identity_key   TEXT,
  p_tournament_ids UUID[]      DEFAULT NULL,
  p_from           TIMESTAMPTZ DEFAULT NULL,
  p_to             TIMESTAMPTZ DEFAULT NULL,
  p_game_id        TEXT        DEFAULT NULL
)
RETURNS TABLE(
  deck_pokemon1  INT,
  deck_pokemon2  INT,
  entries        INT,
  wins           INT,
  losses         INT,
  draws          INT,
  matches_played INT,
  best_finish    INT,
  event_wins     INT,
  first_used     TIMESTAMPTZ,
  last_used      TIMESTAMPTZ
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
  mine AS (
    SELECT
      c.tournament_player_id AS tpid,
      c.tournament_id        AS tid,
      c.played_at,
      t.status               AS event_status,
      tp.deck_pokemon1       AS d1,
      tp.deck_pokemon2       AS d2
    FROM chosen c
    JOIN public.tournaments t        ON t.id  = c.tournament_id
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE c.identity_key = p_identity_key
  )
  SELECT
    m.d1,
    m.d2,
    COUNT(*)::INT,
    COALESCE(SUM(ts.wins), 0)::INT,
    COALESCE(SUM(ts.losses), 0)::INT,
    COALESCE(SUM(ts.draws), 0)::INT,
    COALESCE(SUM(ts.matches_played), 0)::INT,
    MIN(ts.position) FILTER (WHERE m.event_status = 'completed')::INT,
    COUNT(*) FILTER (
      WHERE m.event_status = 'completed' AND ts.position = 1
    )::INT,
    MIN(m.played_at),
    MAX(m.played_at)
  FROM mine m
  LEFT JOIN public.tournament_standings ts
    ON ts.tournament_id = m.tid
   AND ts.player_id     = m.tpid
  GROUP BY m.d1, m.d2
  ORDER BY COUNT(*) DESC, MAX(m.played_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_player_decks(
  UUID, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_player_events
-- Where they have played, newest first, with the deck they brought.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_player_events(
  p_workspace_id   UUID,
  p_identity_key   TEXT,
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
  deck_pokemon1   INT,
  deck_pokemon2   INT,
  wins            INT,
  losses          INT,
  draws           INT,
  byes            INT,
  matches_played  INT,
  finish_position INT,
  field_size      INT
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
  )
  SELECT
    c.tournament_id,
    t.name::TEXT,
    c.played_at,
    t.status::TEXT,
    tp.deck_pokemon1,
    tp.deck_pokemon2,
    COALESCE(ts.wins, 0)::INT,
    COALESCE(ts.losses, 0)::INT,
    COALESCE(ts.draws, 0)::INT,
    COALESCE(ts.byes_received, 0)::INT,
    COALESCE(ts.matches_played, 0)::INT,
    ts.position::INT,
    (
      SELECT COUNT(*)::INT
      FROM public.tournament_players f
      WHERE f.tournament_id = c.tournament_id
    )
  FROM chosen c
  JOIN public.tournaments t         ON t.id  = c.tournament_id
  JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
  LEFT JOIN public.tournament_standings ts
    ON ts.tournament_id = c.tournament_id
   AND ts.player_id     = c.tournament_player_id
  WHERE c.identity_key = p_identity_key
  ORDER BY c.played_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_player_events(
  UUID, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_player_opponents
-- Head to head. Byes are excluded — there is nobody on the other side of one.
-- Both players resolve through workspace_player_identities, so a rivalry is
-- not split across spellings of either name.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_player_opponents(
  p_workspace_id   UUID,
  p_identity_key   TEXT,
  p_tournament_ids UUID[]      DEFAULT NULL,
  p_from           TIMESTAMPTZ DEFAULT NULL,
  p_to             TIMESTAMPTZ DEFAULT NULL,
  p_game_id        TEXT        DEFAULT NULL
)
RETURNS TABLE(
  opponent_key   TEXT,
  opponent_name  TEXT,
  is_linked      BOOLEAN,
  matches_played INT,
  wins           INT,
  losses         INT,
  draws          INT,
  last_played    TIMESTAMPTZ
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
  WITH ids AS (
    SELECT * FROM public.workspace_player_identities(p_workspace_id)
  ),
  chosen AS (
    SELECT i.*
    FROM ids i
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
  duels AS (
    SELECT
      c.played_at,
      CASE
        WHEN tm.player1_id = c.tournament_player_id THEN tm.player2_id
        ELSE tm.player1_id
      END AS opp_tpid,
      CASE
        WHEN tm.winner_id = c.tournament_player_id THEN 'win'
        WHEN tm.winner_id IS NULL                  THEN 'draw'
        ELSE 'loss'
      END AS outcome
    FROM chosen c
    JOIN public.tournament_matches tm
      ON tm.tournament_id = c.tournament_id
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND (
          tm.player1_id = c.tournament_player_id
       OR tm.player2_id = c.tournament_player_id
     )
    WHERE c.identity_key = p_identity_key
  )
  SELECT
    o.identity_key::TEXT,
    MAX(o.display_name)::TEXT,
    BOOL_OR(o.is_linked),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE d.outcome = 'win')::INT,
    COUNT(*) FILTER (WHERE d.outcome = 'loss')::INT,
    COUNT(*) FILTER (WHERE d.outcome = 'draw')::INT,
    MAX(d.played_at)
  FROM duels d
  JOIN ids o ON o.tournament_player_id = d.opp_tpid
  WHERE o.identity_key <> p_identity_key
  GROUP BY o.identity_key
  ORDER BY COUNT(*) DESC, MAX(d.played_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_player_opponents(
  UUID, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;
