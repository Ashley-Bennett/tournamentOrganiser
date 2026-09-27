-- Deck identity for the stats pages.
--
-- 1. Slot order no longer matters. The deck picker's "Slot 1"/"Slot 2" carry no
--    meaning, but every stats RPC grouped on the ordered pair, so
--    Dragapult/Dudunsparce and Dudunsparce/Dragapult were two decks, and so were
--    a lone Pokémon in slot 1 and the same Pokémon in slot 2. Decks are now
--    compared through deck_norm(), which is order-free. Stored data is left
--    as entered — the tournament pages still show the player's own order, and
--    the stats show whichever order was entered most often.
--
-- 2. Optional "stack variants" (p_stack_variants). A pair folds into one of its
--    Pokémon when that Pokémon has been registered on its own somewhere — so
--    Mega Lucario/Hariyama stacks into Mega Lucario once anyone has played solo
--    Mega Lucario, while support Pokémon (rarely played solo) do not pull decks
--    towards themselves. If both qualify, the one played solo more often wins.
--    The anchor set is global rather than filter-scoped so a stacked deck means
--    the same thing on every section, season and drill-down.
--
-- Signatures gain p_stack_variants, and the list RPCs a `variants` column, so
-- the old functions are dropped rather than replaced.

-- ── 1. Helpers ────────────────────────────────────────────────────────────────

-- Order-free deck key: {a, b} with a < b, or {x} for a single Pokémon (either
-- slot, or the same Pokémon in both). NULL when no deck is registered.
-- IMMUTABLE and without SET search_path so it inlines and can back an index.
CREATE OR REPLACE FUNCTION public.deck_norm(p1 INT, p2 INT)
RETURNS INT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p1 IS NULL AND p2 IS NULL THEN NULL
    WHEN p1 IS NULL OR p2 IS NULL OR p1 = p2 THEN ARRAY[COALESCE(p1, p2)]
    WHEN p1 < p2 THEN ARRAY[p1, p2]
    ELSE ARRAY[p2, p1]
  END
$$;

CREATE INDEX IF NOT EXISTS tournament_players_deck_norm_idx
  ON public.tournament_players (public.deck_norm(deck_pokemon1, deck_pokemon2));

-- A deck as the player entered it, except that a lone Pokémon is always in
-- the first slot. Used to pick the order a pair is displayed in.
CREATE OR REPLACE FUNCTION public.deck_entered(p1 INT, p2 INT)
RETURNS INT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN cardinality(public.deck_norm(p1, p2)) = 1 THEN public.deck_norm(p1, p2)
    ELSE ARRAY[p1, p2]
  END
$$;

-- How many entries have registered this Pokémon on its own.
CREATE OR REPLACE FUNCTION public.deck_solo_count(p_pokemon INT)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INT
  FROM public.tournament_players tp
  WHERE public.deck_norm(tp.deck_pokemon1, tp.deck_pokemon2) = ARRAY[p_pokemon]
$$;

-- The key a deck is grouped under on the stats pages. Without stacking it is
-- deck_norm(); with stacking a pair collapses to its better-established solo
-- anchor, if it has one.
CREATE OR REPLACE FUNCTION public.deck_stats_key(p1 INT, p2 INT, p_stack BOOLEAN)
RETURNS INT[]
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN NOT COALESCE(p_stack, FALSE) OR x.k IS NULL OR cardinality(x.k) < 2 THEN x.k
    ELSE COALESCE((
      SELECT ARRAY[a.pid]
      FROM unnest(x.k) AS a(pid)
      CROSS JOIN LATERAL (SELECT public.deck_solo_count(a.pid) AS n) s
      WHERE s.n > 0
      ORDER BY s.n DESC, a.pid
      LIMIT 1
    ), x.k)
  END
  FROM (SELECT public.deck_norm(p1, p2) AS k) x
$$;

-- Only the stats RPCs (SECURITY DEFINER) need these; they read across every
-- tournament, so keep them off the API.
REVOKE ALL ON FUNCTION public.deck_solo_count(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deck_stats_key(INT, INT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── 2. Drop the old signatures ────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_organiser_meta_share(UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_organiser_deck_diversity(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_organiser_deck_pilots(UUID, INT, INT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_organiser_deck_events(UUID, INT, INT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_organiser_player_decks(UUID, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_player_deck_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_player_matchup_matrix(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.get_player_first_second_stats(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

-- ── 3. get_organiser_meta_share ───────────────────────────────────────────────

CREATE FUNCTION public.get_organiser_meta_share(
  p_workspace_id    UUID,
  p_tournament_ids  UUID[]      DEFAULT NULL,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  deck_pokemon1 INT, deck_pokemon2 INT, variants INT,
  entries INT, pilots INT, match_wins INT, total_matches INT,
  top3_count INT, event_wins INT, first_seen TIMESTAMPTZ, last_seen TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
      tp.deck_pokemon1       AS r1,
      tp.deck_pokemon2       AS r2,
      public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants) AS k
    FROM chosen c
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    -- An entry with no deck registered is not a share of the meta; counting
    -- blanks as their own "deck" would make the biggest bar mean "unknown".
    WHERE tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL
  ),
  match_stats AS (
    SELECT
      d.k,
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
    GROUP BY d.k
  ),
  finishes AS (
    SELECT
      d.k,
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
    GROUP BY d.k
  ),
  summary AS (
    SELECT
      d.k,
      -- One variant: that deck, in the order players entered it most often.
      -- Several (stacked): the Pokémon they were folded into.
      CASE WHEN COUNT(DISTINCT public.deck_norm(d.r1, d.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(d.r1, d.r2))
           ELSE d.k END AS shown,
      COUNT(DISTINCT public.deck_norm(d.r1, d.r2))::INT AS n_variants,
      COUNT(*)::INT                  AS n_entries,
      COUNT(DISTINCT d.ikey)::INT    AS n_pilots,
      MIN(d.played_at)               AS first_at,
      MAX(d.played_at)               AS last_at
    FROM decked d
    GROUP BY d.k
  )
  SELECT
    s.shown[1],
    s.shown[2],
    s.n_variants,
    s.n_entries,
    s.n_pilots,
    COALESCE(ms.n_wins, 0),
    COALESCE(ms.n_matches, 0),
    COALESCE(f.n_top3, 0),
    COALESCE(f.n_event_wins, 0),
    s.first_at,
    s.last_at
  FROM summary s
  LEFT JOIN match_stats ms ON ms.k = s.k
  LEFT JOIN finishes    f  ON f.k  = s.k
  ORDER BY s.n_entries DESC, s.last_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_meta_share(UUID, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;

-- ── 4. get_organiser_deck_diversity ───────────────────────────────────────────

CREATE FUNCTION public.get_organiser_deck_diversity(
  p_workspace_id    UUID,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_bucket          TEXT        DEFAULT 'month',
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  period_label TEXT, period_start TIMESTAMPTZ, events INT, decked_entries INT,
  distinct_decks INT, effective_decks NUMERIC, top_deck_share NUMERIC,
  top_deck1 INT, top_deck2 INT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
  WITH decked AS (
    SELECT
      DATE_TRUNC(p_bucket, i.played_at) AS bucket_start,
      i.tournament_id                   AS tid,
      tp.deck_pokemon1                  AS r1,
      tp.deck_pokemon2                  AS r2,
      public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants) AS k
    FROM public.workspace_player_identities(p_workspace_id) i
    JOIN public.tournament_players tp ON tp.id = i.tournament_player_id
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
      AND (tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL)
  ),
  per_deck AS (
    SELECT
      d.bucket_start,
      d.k,
      CASE WHEN COUNT(DISTINCT public.deck_norm(d.r1, d.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(d.r1, d.r2))
           ELSE d.k END AS shown,
      COUNT(*)::INT AS n
    FROM decked d
    GROUP BY d.bucket_start, d.k
  ),
  per_bucket AS (
    SELECT
      d.bucket_start,
      COUNT(*)::INT                  AS entries,
      COUNT(DISTINCT d.tid)::INT     AS events
    FROM decked d
    GROUP BY d.bucket_start
  ),
  shannon AS (
    SELECT
      pd.bucket_start,
      COUNT(*)::INT AS n_distinct,
      -- exp(-Σ p·ln p). A period with a single deck gives ln(1)=0, so the
      -- effective count is exactly 1 rather than undefined.
      EXP(-SUM((pd.n::FLOAT / pb.entries) * LN(pd.n::FLOAT / pb.entries))) AS effective
    FROM per_deck pd
    JOIN per_bucket pb ON pb.bucket_start = pd.bucket_start
    GROUP BY pd.bucket_start
  ),
  top_deck AS (
    SELECT DISTINCT ON (pd.bucket_start)
      pd.bucket_start, pd.shown, pd.n
    FROM per_deck pd
    ORDER BY pd.bucket_start, pd.n DESC, pd.k
  )
  SELECT
    CASE p_bucket
      WHEN 'month'   THEN TO_CHAR(pb.bucket_start, 'Mon YY')
      WHEN 'quarter' THEN 'Q' || EXTRACT(QUARTER FROM pb.bucket_start)::TEXT
                            || ' ' || TO_CHAR(pb.bucket_start, 'YY')
      ELSE TO_CHAR(pb.bucket_start, 'YYYY')
    END,
    pb.bucket_start,
    pb.events,
    pb.entries,
    s.n_distinct,
    ROUND(s.effective::NUMERIC, 1),
    ROUND((td.n::NUMERIC / pb.entries) * 100, 0),
    td.shown[1],
    td.shown[2]
  FROM per_bucket pb
  JOIN shannon  s  ON s.bucket_start  = pb.bucket_start
  JOIN top_deck td ON td.bucket_start = pb.bucket_start
  ORDER BY pb.bucket_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_deck_diversity(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ── 5. get_organiser_deck_pilots ──────────────────────────────────────────────

CREATE FUNCTION public.get_organiser_deck_pilots(
  p_workspace_id    UUID,
  p_deck_pokemon1   INT         DEFAULT NULL,
  p_deck_pokemon2   INT         DEFAULT NULL,
  p_tournament_ids  UUID[]      DEFAULT NULL,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  identity_key TEXT, display_name TEXT, is_linked BOOLEAN, entries INT,
  match_wins INT, total_matches INT, best_finish INT, event_wins INT,
  first_used TIMESTAMPTZ, last_used TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    -- The requested deck is keyed exactly as the rows are, so any slot order
    -- works and a stacked row's shown deck finds its whole family.
    WHERE public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants)
          = public.deck_stats_key(p_deck_pokemon1, p_deck_pokemon2, p_stack_variants)
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

GRANT EXECUTE ON FUNCTION public.get_organiser_deck_pilots(UUID, INT, INT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;

-- ── 6. get_organiser_deck_events ──────────────────────────────────────────────

CREATE FUNCTION public.get_organiser_deck_events(
  p_workspace_id    UUID,
  p_deck_pokemon1   INT         DEFAULT NULL,
  p_deck_pokemon2   INT         DEFAULT NULL,
  p_tournament_ids  UUID[]      DEFAULT NULL,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  tournament_id UUID, tournament_name TEXT, played_at TIMESTAMPTZ, event_status TEXT,
  copies INT, field_size INT, best_finish INT, match_wins INT, total_matches INT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    WHERE public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants)
          = public.deck_stats_key(p_deck_pokemon1, p_deck_pokemon2, p_stack_variants)
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

GRANT EXECUTE ON FUNCTION public.get_organiser_deck_events(UUID, INT, INT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;

-- ── 7. get_organiser_player_decks ─────────────────────────────────────────────

CREATE FUNCTION public.get_organiser_player_decks(
  p_workspace_id    UUID,
  p_identity_key    TEXT,
  p_tournament_ids  UUID[]      DEFAULT NULL,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  deck_pokemon1 INT, deck_pokemon2 INT, variants INT, entries INT,
  wins INT, losses INT, draws INT, matches_played INT, best_finish INT,
  event_wins INT, first_used TIMESTAMPTZ, last_used TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
      tp.deck_pokemon1       AS r1,
      tp.deck_pokemon2       AS r2,
      -- NULL for entries without a deck; they still group together as before.
      public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants) AS k
    FROM chosen c
    JOIN public.tournaments t        ON t.id  = c.tournament_id
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE c.identity_key = p_identity_key
  ),
  grouped AS (
    SELECT
      CASE WHEN COUNT(DISTINCT public.deck_norm(m.r1, m.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(m.r1, m.r2))
           ELSE m.k END AS shown,
      COUNT(DISTINCT public.deck_norm(m.r1, m.r2))::INT AS n_variants,
      COUNT(*)::INT AS n_entries,
      COALESCE(SUM(ts.wins), 0)::INT AS n_wins,
      COALESCE(SUM(ts.losses), 0)::INT AS n_losses,
      COALESCE(SUM(ts.draws), 0)::INT AS n_draws,
      COALESCE(SUM(ts.matches_played), 0)::INT AS n_played,
      MIN(ts.position) FILTER (WHERE m.event_status = 'completed')::INT AS best_pos,
      COUNT(*) FILTER (
        WHERE m.event_status = 'completed' AND ts.position = 1
      )::INT AS n_event_wins,
      MIN(m.played_at) AS first_at,
      MAX(m.played_at) AS last_at
    FROM mine m
    LEFT JOIN public.tournament_standings ts
      ON ts.tournament_id = m.tid
     AND ts.player_id     = m.tpid
    GROUP BY m.k
  )
  SELECT
    g.shown[1], g.shown[2], g.n_variants, g.n_entries,
    g.n_wins, g.n_losses, g.n_draws, g.n_played,
    g.best_pos, g.n_event_wins, g.first_at, g.last_at
  FROM grouped g
  ORDER BY g.n_entries DESC, g.last_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_player_decks(UUID, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;

-- ── 8. get_player_deck_stats ──────────────────────────────────────────────────

CREATE FUNCTION public.get_player_deck_stats(
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  deck_pokemon1 INT, deck_pokemon2 INT, variants INT, tournaments_played INT,
  match_wins INT, total_matches INT, top3_count INT, top8_count INT,
  first_used TIMESTAMPTZ, last_used TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT
      tp.id AS player_id, tp.tournament_id, tp.created_at,
      tp.deck_pokemon1 AS r1,
      tp.deck_pokemon2 AS r2,
      public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants) AS k
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  match_stats AS (
    SELECT
      me.k,
      COUNT(*) FILTER (
        WHERE (tm.status = 'completed' AND tm.player2_id IS NOT NULL)
           OR tm.status = 'bye'
      )::INT AS total,
      COUNT(*) FILTER (
        WHERE (tm.status = 'completed' AND tm.player2_id IS NOT NULL AND tm.winner_id = me.player_id)
           OR tm.status = 'bye'
      )::INT AS wins
    FROM my_entries me
    LEFT JOIN public.tournament_matches tm
      ON tm.tournament_id = me.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    GROUP BY me.k
  ),
  top_finishes AS (
    SELECT
      me.k,
      COUNT(*) FILTER (WHERE ts.position <= 3 AND fs.n >= 3)::INT AS top3,
      COUNT(*) FILTER (WHERE ts.position <= 8 AND fs.n >= 8)::INT AS top8
    FROM my_entries me
    JOIN public.tournaments t ON t.id = me.tournament_id AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = me.tournament_id AND ts.player_id = me.player_id
    JOIN (
      SELECT tournament_id, COUNT(*)::INT AS n
      FROM public.tournament_standings GROUP BY tournament_id
    ) fs ON fs.tournament_id = me.tournament_id
    GROUP BY me.k
  ),
  summary AS (
    SELECT
      me.k,
      CASE WHEN COUNT(DISTINCT public.deck_norm(me.r1, me.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(me.r1, me.r2))
           ELSE me.k END AS shown,
      COUNT(DISTINCT public.deck_norm(me.r1, me.r2))::INT AS n_variants,
      COUNT(DISTINCT me.tournament_id)::INT AS tournaments_played,
      MIN(me.created_at)                    AS first_used,
      MAX(me.created_at)                    AS last_used
    FROM my_entries me
    GROUP BY me.k
  )
  SELECT
    s.shown[1],
    s.shown[2],
    s.n_variants,
    s.tournaments_played,
    COALESCE(ms.wins, 0)  AS match_wins,
    COALESCE(ms.total, 0) AS total_matches,
    COALESCE(tf.top3, 0)  AS top3_count,
    COALESCE(tf.top8, 0)  AS top8_count,
    s.first_used,
    s.last_used
  FROM summary s
  LEFT JOIN match_stats  ms ON ms.k = s.k
  LEFT JOIN top_finishes tf ON tf.k = s.k
  ORDER BY s.tournaments_played DESC, s.last_used DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_deck_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;

-- ── 9. get_player_matchup_matrix ──────────────────────────────────────────────
-- Opponent decks are keyed the same way as the player's own. The reported deck
-- (match_insights) now wins as a whole pair: the old per-slot COALESCE could
-- splice a one-Pokémon report together with slot 2 of the registered deck.

CREATE FUNCTION public.get_player_matchup_matrix(
  p_deck_pokemon1   INT         DEFAULT NULL,
  p_deck_pokemon2   INT         DEFAULT NULL,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  opp_pokemon1 INT, opp_pokemon2 INT, matches_played INT,
  wins INT, losses INT, draws INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  my_matches AS (
    SELECT
      tm.id                                                                   AS match_id,
      me.player_id                                                            AS my_player_id,
      CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id
           ELSE tm.player1_id END                                             AS opp_player_id,
      tm.winner_id,
      tm.tournament_id
    FROM public.tournament_matches tm
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
      AND ((p_deck_pokemon1 IS NULL AND p_deck_pokemon2 IS NULL) OR
        public.deck_stats_key(me.deck_pokemon1, me.deck_pokemon2, p_stack_variants)
          = public.deck_stats_key(p_deck_pokemon1, p_deck_pokemon2, p_stack_variants))
  ),
  -- Resolve opponent deck: prefer match_insights (player-reported), fall back to tournament_players.
  -- match_insights.player_id is auth.users.id (v_uid), not tournament_players.id.
  with_opp_deck AS (
    SELECT
      mm.my_player_id,
      mm.winner_id,
      CASE WHEN mi.opponent_deck_pokemon1 IS NOT NULL OR mi.opponent_deck_pokemon2 IS NOT NULL
           THEN mi.opponent_deck_pokemon1 ELSE opp_tp.deck_pokemon1 END AS r1,
      CASE WHEN mi.opponent_deck_pokemon1 IS NOT NULL OR mi.opponent_deck_pokemon2 IS NOT NULL
           THEN mi.opponent_deck_pokemon2 ELSE opp_tp.deck_pokemon2 END AS r2
    FROM my_matches mm
    LEFT JOIN public.tournament_players opp_tp
      ON opp_tp.id = mm.opp_player_id AND opp_tp.tournament_id = mm.tournament_id
    LEFT JOIN public.match_insights mi
      ON mi.match_id = mm.match_id AND mi.player_id = v_uid
  ),
  keyed AS (
    SELECT wod.*, public.deck_stats_key(wod.r1, wod.r2, p_stack_variants) AS k
    FROM with_opp_deck wod
    WHERE wod.r1 IS NOT NULL OR wod.r2 IS NOT NULL
  ),
  grouped AS (
    SELECT
      CASE WHEN COUNT(DISTINCT public.deck_norm(kd.r1, kd.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(kd.r1, kd.r2))
           ELSE kd.k END AS shown,
      COUNT(*)::INT                                                AS n_played,
      COUNT(*) FILTER (WHERE kd.winner_id = kd.my_player_id)::INT AS n_wins,
      COUNT(*) FILTER (WHERE kd.winner_id IS NOT NULL
                         AND kd.winner_id != kd.my_player_id)::INT AS n_losses,
      COUNT(*) FILTER (WHERE kd.winner_id IS NULL)::INT            AS n_draws
    FROM keyed kd
    GROUP BY kd.k
  )
  SELECT g.shown[1], g.shown[2], g.n_played, g.n_wins, g.n_losses, g.n_draws
  FROM grouped g
  ORDER BY g.n_played DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_matchup_matrix(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;

-- ── 10. get_player_first_second_stats ─────────────────────────────────────────

CREATE FUNCTION public.get_player_first_second_stats(
  p_deck_pokemon1   INT         DEFAULT NULL,
  p_deck_pokemon2   INT         DEFAULT NULL,
  p_from            TIMESTAMPTZ DEFAULT NULL,
  p_to              TIMESTAMPTZ DEFAULT NULL,
  p_game_id         TEXT        DEFAULT NULL,
  p_stack_variants  BOOLEAN     DEFAULT FALSE
)
RETURNS TABLE(
  went_first_wins INT, went_first_total INT, went_second_wins INT,
  went_second_total INT, insights_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  insights_with_outcome AS (
    SELECT
      mi.went_first,
      CASE
        WHEN tm.winner_id = me.player_id THEN 'win'
        WHEN tm.winner_id IS NULL THEN 'draw'
        ELSE 'loss'
      END AS outcome
    FROM public.match_insights mi
    JOIN public.tournament_matches tm ON tm.id = mi.match_id
    -- Join on tournament to get the deck; match_insights.player_id = auth.users.id (v_uid)
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
    WHERE mi.player_id = v_uid
      AND mi.went_first IS NOT NULL
      AND tm.status = 'completed'
      AND tm.player2_id IS NOT NULL
      AND ((p_deck_pokemon1 IS NULL AND p_deck_pokemon2 IS NULL) OR
        public.deck_stats_key(me.deck_pokemon1, me.deck_pokemon2, p_stack_variants)
          = public.deck_stats_key(p_deck_pokemon1, p_deck_pokemon2, p_stack_variants))
  )
  SELECT
    COUNT(*) FILTER (WHERE went_first = TRUE  AND outcome = 'win')::INT  AS went_first_wins,
    COUNT(*) FILTER (WHERE went_first = TRUE)::INT                        AS went_first_total,
    COUNT(*) FILTER (WHERE went_first = FALSE AND outcome = 'win')::INT  AS went_second_wins,
    COUNT(*) FILTER (WHERE went_first = FALSE)::INT                       AS went_second_total,
    COUNT(*)::INT                                                          AS insights_count
  FROM insights_with_outcome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_first_second_stats(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
