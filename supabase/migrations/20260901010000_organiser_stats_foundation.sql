-- ============================================================
-- Organiser stats: foundation (2026-09-01) — Phase 1
--
-- The player stats page answers "how am I doing". This is the other
-- side of the same data: "how is my event doing". It is scoped to a
-- workspace rather than a user, so every organiser in a club sees the
-- same numbers, and it follows the shape the player RPCs already use —
-- SECURITY DEFINER, (p_from, p_to, p_game_id), never mixing games.
--
-- The hard part is identity. tournament_players.user_id is nullable:
-- a walk-in is a name-only row, and every row is per-tournament, so
-- "Dave" at six events is six unrelated rows. workspace_player_identities
-- resolves them; everything else here builds on it.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- workspace_player_identities
--
-- One row per tournament entry in the workspace, tagged with the identity it
-- belongs to. The key is, in order of preference:
--
--   1. the entry's own user_id, when the player has linked an account;
--   2. the account that the same normalised name is linked to elsewhere in
--      the workspace — so Dave's three walk-in entries and his fourth, linked
--      one count as one person rather than two. Only applied when the name
--      maps to exactly one account; an ambiguous name falls through to (3);
--   3. 'name:' + the lowercased, trimmed name.
--
-- The 'name:' prefix keeps a name from ever colliding with a UUID string.
--
-- This is deliberately fuzzy: two different Daves merge, and a typo splits one
-- person in two. Callers surface the linked-account count alongside the total
-- so the reader can see how much of the number is name matching.
--
-- Draft tournaments are excluded throughout — they have players but have not
-- happened, and counting them would inflate attendance.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workspace_player_identities(
  p_workspace_id UUID
)
RETURNS TABLE(
  tournament_player_id UUID,
  tournament_id        UUID,
  identity_key         TEXT,
  display_name         TEXT,
  is_linked            BOOLEAN,
  played_at            TIMESTAMPTZ,
  game_id              TEXT,
  dropped              BOOLEAN,
  is_late_entry        BOOLEAN
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

  -- Any workspace role may read stats. An IS NULL test does not need the
  -- COALESCE that a NOT IN guard does, but it is spelled out rather than
  -- reusing the NOT IN shape that silently authorised non-members in
  -- 20260825130000.
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT
      tp.id,
      tp.tournament_id,
      tp.user_id,
      tp.name,
      LOWER(BTRIM(tp.name))               AS norm_name,
      COALESCE(t.starts_at, t.created_at) AS played_at,
      t.game_id,
      tp.dropped,
      tp.is_late_entry
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE t.workspace_id = p_workspace_id
      AND t.status <> 'draft'
  ),
  name_to_user AS (
    SELECT
      e.norm_name,
      (ARRAY_AGG(DISTINCT e.user_id))[1] AS user_id
    FROM entries e
    WHERE e.user_id IS NOT NULL
    GROUP BY e.norm_name
    HAVING COUNT(DISTINCT e.user_id) = 1
  ),
  keyed AS (
    SELECT
      e.*,
      COALESCE(e.user_id, ntu.user_id) AS resolved_user_id,
      COALESCE(
        e.user_id::TEXT,
        ntu.user_id::TEXT,
        'name:' || e.norm_name
      ) AS resolved_key
    FROM entries e
    LEFT JOIN name_to_user ntu ON ntu.norm_name = e.norm_name
  ),
  labelled AS (
    -- The name from the most recent entry wins, so a player who corrects
    -- their spelling is shown the corrected version.
    SELECT
      k.*,
      FIRST_VALUE(k.name) OVER (
        PARTITION BY k.resolved_key
        ORDER BY k.played_at DESC, k.id DESC
      ) AS resolved_display_name
    FROM keyed k
  )
  SELECT
    l.id,
    l.tournament_id,
    l.resolved_key,
    l.resolved_display_name,
    l.resolved_user_id IS NOT NULL,
    l.played_at,
    l.game_id,
    l.dropped,
    l.is_late_entry
  FROM labelled l;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_stats_games / _years
-- Drive the two filters. Same contract as the player equivalents: the game
-- picker hides itself below two rows, and only years with results are offered.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_stats_games(
  p_workspace_id UUID
)
RETURNS TABLE(
  game_id     TEXT,
  tournaments INT,
  players     INT
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
  SELECT
    i.game_id::TEXT,
    COUNT(DISTINCT i.tournament_id)::INT,
    COUNT(DISTINCT i.identity_key)::INT
  FROM public.workspace_player_identities(p_workspace_id) i
  GROUP BY i.game_id
  ORDER BY COUNT(DISTINCT i.tournament_id) DESC, i.game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organiser_stats_years(
  p_workspace_id UUID,
  p_game_id      TEXT DEFAULT NULL
)
RETURNS TABLE(
  year        INT,
  tournaments INT,
  players     INT
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
  SELECT
    EXTRACT(YEAR FROM i.played_at)::INT AS yr,
    COUNT(DISTINCT i.tournament_id)::INT,
    COUNT(DISTINCT i.identity_key)::INT
  FROM public.workspace_player_identities(p_workspace_id) i
  WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
  GROUP BY EXTRACT(YEAR FROM i.played_at)
  ORDER BY yr DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_overview_stats
--
-- The headline cards. new_players counts identities whose FIRST event in this
-- workspace falls inside the range — first_seen is computed across all of the
-- workspace's history, so filtering to a year does not relabel every regular
-- as a newcomer. The game filter does apply to first_seen: someone who played
-- Pokémon for a year and then turns up to the first chess night is new to
-- chess, which is the reading an organiser wants.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_overview_stats(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT DEFAULT NULL
)
RETURNS TABLE(
  events_total       INT,
  events_completed   INT,
  unique_players     INT,
  linked_players     INT,
  new_players        INT,
  returning_players  INT,
  total_entries      INT,
  total_matches      INT,
  avg_field_size     NUMERIC,
  largest_event_name TEXT,
  largest_event_size INT,
  dropped_entries    INT,
  late_entries       INT
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
  WITH all_entries AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
  ),
  first_seen AS (
    SELECT ae.identity_key AS ikey, MIN(ae.played_at) AS first_played
    FROM all_entries ae
    GROUP BY ae.identity_key
  ),
  in_range AS (
    SELECT ae.*
    FROM all_entries ae
    WHERE (p_from IS NULL OR ae.played_at >= p_from)
      AND (p_to   IS NULL OR ae.played_at <  p_to)
  ),
  events AS (
    SELECT
      t.id                                AS event_id,
      t.name                              AS event_name,
      t.status                            AS event_status,
      COUNT(ir.tournament_player_id)::INT AS field_size
    FROM public.tournaments t
    JOIN in_range ir ON ir.tournament_id = t.id
    GROUP BY t.id, t.name, t.status
  ),
  match_count AS (
    SELECT COUNT(*)::INT AS n
    FROM public.tournament_matches tm
    WHERE tm.tournament_id IN (SELECT e.event_id FROM events e)
      AND tm.status IN ('completed', 'bye')
  ),
  largest AS (
    SELECT e.event_name, e.field_size
    FROM events e
    ORDER BY e.field_size DESC, e.event_name
    LIMIT 1
  ),
  people AS (
    SELECT
      COUNT(DISTINCT ir.identity_key)::INT AS uniq,
      COUNT(DISTINCT ir.identity_key) FILTER (WHERE ir.is_linked)::INT AS linked,
      COUNT(DISTINCT ir.identity_key) FILTER (
        WHERE fs.first_played >= COALESCE(p_from, '-infinity'::TIMESTAMPTZ)
      )::INT AS newbies
    FROM in_range ir
    JOIN first_seen fs ON fs.ikey = ir.identity_key
  )
  SELECT
    (SELECT COUNT(*)::INT FROM events),
    (SELECT COUNT(*)::INT FROM events e WHERE e.event_status = 'completed'),
    p.uniq,
    p.linked,
    p.newbies,
    (p.uniq - p.newbies)::INT,
    (SELECT COUNT(*)::INT FROM in_range),
    (SELECT mc.n FROM match_count mc),
    (SELECT ROUND(AVG(e.field_size), 1) FROM events e),
    (SELECT l.event_name FROM largest l),
    (SELECT l.field_size FROM largest l),
    (SELECT COUNT(*)::INT FROM in_range ir WHERE ir.dropped),
    (SELECT COUNT(*)::INT FROM in_range ir WHERE ir.is_late_entry)
  FROM people p;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_attendance
-- The regulars leaderboard: who actually turns up. Sorted by events attended,
-- and carrying enough detail to double as a hall of fame.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_attendance(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT DEFAULT NULL,
  p_limit        INT DEFAULT 50
)
RETURNS TABLE(
  identity_key   TEXT,
  display_name   TEXT,
  is_linked      BOOLEAN,
  events_played  INT,
  first_played   TIMESTAMPTZ,
  last_played    TIMESTAMPTZ,
  matches        INT,
  match_wins     INT,
  event_wins     INT,
  top3_finishes  INT
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
  WITH in_range AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
  ),
  match_stats AS (
    SELECT
      ir.identity_key AS ikey,
      COUNT(tm.id)::INT AS n_matches,
      COUNT(tm.id) FILTER (
        WHERE tm.status = 'bye'
           OR (tm.status = 'completed' AND tm.winner_id = ir.tournament_player_id)
      )::INT AS n_wins
    FROM in_range ir
    JOIN public.tournament_matches tm
      ON tm.tournament_id = ir.tournament_id
     AND (tm.player1_id = ir.tournament_player_id OR tm.player2_id = ir.tournament_player_id)
     AND tm.status IN ('completed', 'bye')
    GROUP BY ir.identity_key
  ),
  finishes AS (
    SELECT
      ir.identity_key AS ikey,
      COUNT(*) FILTER (WHERE ts.position = 1)::INT AS n_event_wins,
      COUNT(*) FILTER (WHERE ts.position <= 3 AND fs.n >= 3)::INT AS n_top3
    FROM in_range ir
    JOIN public.tournaments t
      ON t.id = ir.tournament_id AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = ir.tournament_id
     AND ts.player_id = ir.tournament_player_id
    JOIN (
      SELECT ts2.tournament_id AS tid, COUNT(*)::INT AS n
      FROM public.tournament_standings ts2
      GROUP BY ts2.tournament_id
    ) fs ON fs.tid = ir.tournament_id
    GROUP BY ir.identity_key
  ),
  summary AS (
    SELECT
      ir.identity_key                         AS ikey,
      MAX(ir.display_name)                    AS name,
      BOOL_OR(ir.is_linked)                   AS linked,
      COUNT(DISTINCT ir.tournament_id)::INT   AS n_events,
      MIN(ir.played_at)                       AS first_at,
      MAX(ir.played_at)                       AS last_at
    FROM in_range ir
    GROUP BY ir.identity_key
  )
  SELECT
    s.ikey,
    s.name,
    s.linked,
    s.n_events,
    s.first_at,
    s.last_at,
    COALESCE(ms.n_matches, 0),
    COALESCE(ms.n_wins, 0),
    COALESCE(f.n_event_wins, 0),
    COALESCE(f.n_top3, 0)
  FROM summary s
  LEFT JOIN match_stats ms ON ms.ikey = s.ikey
  LEFT JOIN finishes    f  ON f.ikey  = s.ikey
  ORDER BY s.n_events DESC, s.last_at DESC, s.name
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_organiser_timeline
--
-- Attendance over time, bucketed monthly / quarterly / yearly. new_players is
-- computed the same way as in the overview: first appearance across the whole
-- workspace history, so a bucket's newcomers are genuinely new rather than
-- just absent from the previous bucket.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_organiser_timeline(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT DEFAULT NULL,
  p_bucket       TEXT DEFAULT 'month'
)
RETURNS TABLE(
  period_label   TEXT,
  period_start   TIMESTAMPTZ,
  events         INT,
  entries        INT,
  unique_players INT,
  new_players    INT,
  avg_field_size NUMERIC
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

  IF p_bucket NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION 'Unsupported bucket %, expected month, quarter or year', p_bucket;
  END IF;

  RETURN QUERY
  WITH all_entries AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
  ),
  first_seen AS (
    SELECT ae.identity_key AS ikey, MIN(ae.played_at) AS first_played
    FROM all_entries ae
    GROUP BY ae.identity_key
  ),
  bucketed AS (
    SELECT
      DATE_TRUNC(p_bucket, ae.played_at) AS bucket_start,
      ae.identity_key                    AS ikey,
      ae.tournament_id                   AS tid,
      ae.tournament_player_id            AS tpid,
      fs.first_played
    FROM all_entries ae
    JOIN first_seen fs ON fs.ikey = ae.identity_key
    WHERE (p_from IS NULL OR ae.played_at >= p_from)
      AND (p_to   IS NULL OR ae.played_at <  p_to)
  )
  SELECT
    CASE p_bucket
      WHEN 'month'   THEN TO_CHAR(b.bucket_start, 'Mon YY')
      WHEN 'quarter' THEN 'Q' || EXTRACT(QUARTER FROM b.bucket_start)::TEXT
                            || ' ' || TO_CHAR(b.bucket_start, 'YY')
      ELSE TO_CHAR(b.bucket_start, 'YYYY')
    END,
    b.bucket_start,
    COUNT(DISTINCT b.tid)::INT,
    COUNT(b.tpid)::INT,
    COUNT(DISTINCT b.ikey)::INT,
    COUNT(DISTINCT b.ikey) FILTER (
      WHERE DATE_TRUNC(p_bucket, b.first_played) = b.bucket_start
    )::INT,
    ROUND(
      COUNT(b.tpid)::NUMERIC / NULLIF(COUNT(DISTINCT b.tid), 0),
      1
    )
  FROM bucketed b
  GROUP BY b.bucket_start
  ORDER BY b.bucket_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_player_identities(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_stats_games(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_stats_years(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_overview_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_attendance(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organiser_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
