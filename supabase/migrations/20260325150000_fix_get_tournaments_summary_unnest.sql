-- Fix: PostgreSQL 17 does not allow unnest(arr1, arr2) AS alias(col1, col2)
-- inside a PL/pgSQL function body. Use SELECT unnest()...unnest() instead.

CREATE OR REPLACE FUNCTION public.get_tournaments_summary(
  p_tournament_ids UUID[],
  p_player_ids     UUID[]
)
RETURNS TABLE(
  tournament_id   UUID,
  tournament_name TEXT,
  workspace_name  TEXT,
  status          TEXT,
  player_position INT,
  total_players   INT
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
          WHEN tm.status = 'bye'                                               THEN 3
          WHEN tm.player2_id IS NULL
            AND tm.result = 'loss'
            AND tm.status = 'completed'                                        THEN 0
          WHEN tm.status = 'completed' AND tm.winner_id = tp.id               THEN 3
          WHEN tm.status = 'completed' AND tm.winner_id IS NULL                THEN 1
          WHEN tm.status = 'completed'                                          THEN 0
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
    t.id::UUID           AS tournament_id,
    t.name::TEXT         AS tournament_name,
    w.name::TEXT         AS workspace_name,
    t.status::TEXT       AS status,
    CASE WHEN t.status = 'completed' THEN r.position      ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN r.total_players ELSE NULL END AS total_players
  FROM input i
  JOIN public.tournaments  t ON t.id = i.tid
  JOIN public.workspaces   w ON w.id = t.workspace_id
  LEFT JOIN ranked         r ON r.tournament_id = i.tid AND r.player_id = i.pid;
END;
$$;
