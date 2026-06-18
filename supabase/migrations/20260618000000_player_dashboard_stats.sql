-- Extend get_my_player_entries to return player_position, total_players, and deck columns.
-- Position is only populated for completed tournaments (matches get_tournaments_summary behaviour).
-- Must DROP first because PostgreSQL cannot replace a function with a different return type.

DROP FUNCTION IF EXISTS public.get_my_player_entries();

CREATE FUNCTION public.get_my_player_entries()
RETURNS TABLE(
  tournament_player_id UUID,
  tournament_id        UUID,
  tournament_name      TEXT,
  tournament_status    TEXT,
  workspace_id         UUID,
  workspace_name       TEXT,
  workspace_slug       TEXT,
  player_name          TEXT,
  joined_at            TIMESTAMPTZ,
  player_position      INT,
  total_players        INT,
  deck_pokemon1        INT,
  deck_pokemon2        INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH my_tournament_ids AS (
    SELECT DISTINCT tp.tournament_id
    FROM public.tournament_players tp
    WHERE tp.user_id = auth.uid()
  ),
  player_points AS (
    SELECT
      tp.tournament_id,
      tp.id AS player_id,
      COALESCE(SUM(
        CASE
          WHEN tm.status = 'bye'                                                          THEN 3
          WHEN tm.player2_id IS NULL AND tm.result = 'loss' AND tm.status = 'completed'  THEN 0
          WHEN tm.status = 'completed' AND tm.winner_id = tp.id                          THEN 3
          WHEN tm.status = 'completed' AND tm.winner_id IS NULL                          THEN 1
          WHEN tm.status = 'completed'                                                    THEN 0
          ELSE 0
        END
      ), 0) AS match_points
    FROM public.tournament_players tp
    JOIN my_tournament_ids mti ON mti.tournament_id = tp.tournament_id
    LEFT JOIN public.tournament_matches tm
      ON  tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    GROUP BY tp.tournament_id, tp.id
  ),
  ranked AS (
    SELECT
      pp.tournament_id,
      pp.player_id,
      RANK()   OVER (PARTITION BY pp.tournament_id ORDER BY pp.match_points DESC)::INT AS position,
      COUNT(*) OVER (PARTITION BY pp.tournament_id)::INT                               AS total_players
    FROM player_points pp
  )
  SELECT
    tp.id::UUID        AS tournament_player_id,
    t.id::UUID         AS tournament_id,
    t.name::TEXT       AS tournament_name,
    t.status::TEXT     AS tournament_status,
    w.id::UUID         AS workspace_id,
    w.name::TEXT       AS workspace_name,
    w.slug::TEXT       AS workspace_slug,
    tp.name::TEXT      AS player_name,
    tp.created_at      AS joined_at,
    CASE WHEN t.status = 'completed' THEN r.position      ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN r.total_players ELSE NULL END AS total_players,
    tp.deck_pokemon1   AS deck_pokemon1,
    tp.deck_pokemon2   AS deck_pokemon2
  FROM public.tournament_players tp
  JOIN public.tournaments t  ON t.id = tp.tournament_id
  JOIN public.workspaces  w  ON w.id = t.workspace_id
  LEFT JOIN ranked        r  ON r.tournament_id = tp.tournament_id AND r.player_id = tp.id
  WHERE tp.user_id = auth.uid()
  ORDER BY tp.created_at DESC;
END;
$$;

-- Extend get_tournaments_summary to also return deck_pokemon1 and deck_pokemon2
-- for the specific player in each tournament.
-- Must DROP first because PostgreSQL cannot replace a function with a different return type.

DROP FUNCTION IF EXISTS public.get_tournaments_summary(UUID[], UUID[]);

CREATE FUNCTION public.get_tournaments_summary(
  p_tournament_ids UUID[],
  p_player_ids     UUID[]
)
RETURNS TABLE(
  tournament_id   UUID,
  tournament_name TEXT,
  workspace_name  TEXT,
  status          TEXT,
  player_position INT,
  total_players   INT,
  deck_pokemon1   INT,
  deck_pokemon2   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input AS (
    SELECT
      unnest(p_tournament_ids) AS tid,
      unnest(p_player_ids)     AS pid
  ),
  player_points AS (
    SELECT
      tp.tournament_id,
      tp.id AS player_id,
      COALESCE(SUM(
        CASE
          WHEN tm.status = 'bye'                                                          THEN 3
          WHEN tm.player2_id IS NULL AND tm.result = 'loss' AND tm.status = 'completed'  THEN 0
          WHEN tm.status = 'completed' AND tm.winner_id = tp.id                          THEN 3
          WHEN tm.status = 'completed' AND tm.winner_id IS NULL                          THEN 1
          WHEN tm.status = 'completed'                                                    THEN 0
          ELSE 0
        END
      ), 0) AS match_points
    FROM public.tournament_players tp
    LEFT JOIN public.tournament_matches tm
      ON  tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    WHERE tp.tournament_id = ANY(p_tournament_ids)
    GROUP BY tp.tournament_id, tp.id
  ),
  ranked AS (
    SELECT
      pp.tournament_id,
      pp.player_id,
      RANK()   OVER (PARTITION BY pp.tournament_id ORDER BY pp.match_points DESC)::INT AS position,
      COUNT(*) OVER (PARTITION BY pp.tournament_id)::INT                               AS total_players
    FROM player_points pp
  )
  SELECT
    t.id::UUID             AS tournament_id,
    t.name::TEXT           AS tournament_name,
    w.name::TEXT           AS workspace_name,
    t.status::TEXT         AS status,
    CASE WHEN t.status = 'completed' THEN r.position      ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN r.total_players ELSE NULL END AS total_players,
    tp_me.deck_pokemon1    AS deck_pokemon1,
    tp_me.deck_pokemon2    AS deck_pokemon2
  FROM input i
  JOIN public.tournaments  t     ON t.id = i.tid
  JOIN public.workspaces   w     ON w.id = t.workspace_id
  LEFT JOIN ranked         r     ON r.tournament_id = i.tid AND r.player_id = i.pid
  LEFT JOIN public.tournament_players tp_me
                                 ON tp_me.id = i.pid AND tp_me.tournament_id = i.tid;
END;
$$;
