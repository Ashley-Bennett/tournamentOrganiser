-- ============================================================
-- Organiser stats: meta share (2026-09-01) — Phase 3
--
-- What people actually brought. The organiser sees the decks that
-- were registered on the entries themselves, so unlike the player
-- matchup matrix there is no need to fall back on match_insights:
-- every entry in their own tournaments is visible to them.
--
-- Only meaningful for a game that has decks. The caller checks the
-- games registry and hides the section for a game whose deck module
-- is "none", the same gate the player stats page already uses; the
-- RPC does not branch on a game id.
--
-- Events are chosen the same way as the league table: an explicit
-- list, or the date window plus game filter.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_organiser_meta_share(
  p_workspace_id   UUID,
  p_tournament_ids UUID[]      DEFAULT NULL,
  p_from           TIMESTAMPTZ DEFAULT NULL,
  p_to             TIMESTAMPTZ DEFAULT NULL,
  p_game_id        TEXT        DEFAULT NULL
)
RETURNS TABLE(
  deck_pokemon1  INT,
  deck_pokemon2  INT,
  entries        INT,
  pilots         INT,
  match_wins     INT,
  total_matches  INT,
  top3_count     INT,
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
  decked AS (
    SELECT
      c.tournament_player_id AS tpid,
      c.tournament_id        AS tid,
      c.identity_key         AS ikey,
      c.played_at,
      tp.deck_pokemon1       AS p1,
      tp.deck_pokemon2       AS p2
    FROM chosen c
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    -- An entry with no deck registered is not a share of the meta; counting
    -- blanks as their own "deck" would make the biggest bar mean "unknown".
    WHERE tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL
  ),
  match_stats AS (
    SELECT
      d.p1, d.p2,
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
    GROUP BY d.p1, d.p2
  ),
  finishes AS (
    SELECT
      d.p1, d.p2,
      COUNT(*) FILTER (WHERE ts.position <= 3 AND fs.n >= 3)::INT AS n_top3,
      COUNT(*) FILTER (WHERE ts.position = 1)::INT                AS n_event_wins
    FROM decked d
    JOIN public.tournaments t ON t.id = d.tid AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = d.tid AND ts.player_id = d.tpid
    JOIN (
      SELECT ts2.tournament_id AS tid, COUNT(*)::INT AS n
      FROM public.tournament_standings ts2
      GROUP BY ts2.tournament_id
    ) fs ON fs.tid = d.tid
    GROUP BY d.p1, d.p2
  ),
  summary AS (
    SELECT
      d.p1, d.p2,
      COUNT(*)::INT                  AS n_entries,
      COUNT(DISTINCT d.ikey)::INT    AS n_pilots,
      MIN(d.played_at)               AS first_at,
      MAX(d.played_at)               AS last_at
    FROM decked d
    GROUP BY d.p1, d.p2
  )
  SELECT
    s.p1,
    s.p2,
    s.n_entries,
    s.n_pilots,
    COALESCE(ms.n_wins, 0),
    COALESCE(ms.n_matches, 0),
    COALESCE(f.n_top3, 0),
    COALESCE(f.n_event_wins, 0),
    s.first_at,
    s.last_at
  FROM summary s
  LEFT JOIN match_stats ms ON ms.p1 IS NOT DISTINCT FROM s.p1
                          AND ms.p2 IS NOT DISTINCT FROM s.p2
  LEFT JOIN finishes    f  ON f.p1  IS NOT DISTINCT FROM s.p1
                          AND f.p2  IS NOT DISTINCT FROM s.p2
  ORDER BY s.n_entries DESC, s.last_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_meta_share(UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
