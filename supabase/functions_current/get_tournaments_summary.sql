CREATE OR REPLACE FUNCTION public.get_tournaments_summary(p_tournament_ids uuid[], p_player_ids uuid[])
 RETURNS TABLE(tournament_id uuid, tournament_name text, workspace_name text, status text, player_position integer, total_players integer, deck_pokemon1 integer, deck_pokemon2 integer, game_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH input AS (
    SELECT unnest(p_tournament_ids) AS tid, unnest(p_player_ids) AS pid
  ),
  field AS (
    SELECT ts.tournament_id, COUNT(*)::INT AS n
    FROM public.tournament_standings ts
    WHERE ts.tournament_id = ANY(p_tournament_ids)
    GROUP BY ts.tournament_id
  )
  SELECT
    t.id::UUID             AS tournament_id,
    t.name::TEXT           AS tournament_name,
    w.name::TEXT           AS workspace_name,
    t.status::TEXT         AS status,
    CASE WHEN t.status = 'completed' THEN ts.position ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN f.n         ELSE NULL END AS total_players,
    tp_me.deck_pokemon1    AS deck_pokemon1,
    tp_me.deck_pokemon2    AS deck_pokemon2,
    t.game_id::TEXT        AS game_id
  FROM input i
  JOIN public.tournaments  t     ON t.id = i.tid
  JOIN public.workspaces   w     ON w.id = t.workspace_id
  LEFT JOIN public.tournament_standings ts ON ts.tournament_id = i.tid AND ts.player_id = i.pid
  LEFT JOIN field f  ON f.tournament_id = i.tid
  LEFT JOIN public.tournament_players tp_me
                                 ON tp_me.id = i.pid AND tp_me.tournament_id = i.tid;
END;
$function$
