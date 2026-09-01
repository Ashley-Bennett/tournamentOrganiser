-- ============================================================
-- Dashboard knows its games (2026-09-01) — 1.0
--
-- The player dashboard's summary cards were computed from every
-- entry the player had, mixing games together — the same thing the
-- stats page stopped doing. It also has a "Favourite Deck" card,
-- which means nothing for a game without decks.
--
-- Both dashboard RPCs now return the tournament's game so the page
-- can scope its cards and hide the deck one where it does not apply.
--
-- DROP first: adding an OUT column changes the return type, which
-- also discards the EXECUTE grants, reissued at the end.
-- Bodies are otherwise unchanged from the live definitions.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_player_entries();
DROP FUNCTION IF EXISTS public.get_tournaments_summary(UUID[], UUID[]);

CREATE OR REPLACE FUNCTION public.get_my_player_entries()
 RETURNS TABLE(tournament_player_id uuid, tournament_id uuid, tournament_name text, tournament_status text, workspace_id uuid, workspace_name text, workspace_slug text, player_name text, joined_at timestamp with time zone, player_position integer, total_players integer, match_wins integer, total_matches integer, deck_pokemon1 integer, deck_pokemon2 integer, game_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- match_wins / total_matches (byes count as wins) — unchanged.
  wins AS (
    SELECT
      tp.tournament_id,
      tp.id AS player_id,
      COUNT(CASE
        WHEN (tm.status = 'completed' AND tm.player2_id IS NOT NULL) OR tm.status = 'bye' THEN 1
      END)::INT AS total_matches,
      COUNT(CASE
        WHEN (tm.status = 'completed' AND tm.player2_id IS NOT NULL AND tm.winner_id = tp.id)
          OR tm.status = 'bye' THEN 1
      END)::INT AS match_wins
    FROM public.tournament_players tp
    JOIN my_tournament_ids mti ON mti.tournament_id = tp.tournament_id
    LEFT JOIN public.tournament_matches tm
      ON  tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    GROUP BY tp.tournament_id, tp.id
  ),
  field AS (
    SELECT ts.tournament_id, COUNT(*)::INT AS n
    FROM public.tournament_standings ts
    GROUP BY ts.tournament_id
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
    CASE WHEN t.status = 'completed' THEN ts.position ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN f.n         ELSE NULL END AS total_players,
    COALESCE(wn.match_wins, 0)    AS match_wins,
    COALESCE(wn.total_matches, 0) AS total_matches,
    tp.deck_pokemon1   AS deck_pokemon1,
    tp.deck_pokemon2   AS deck_pokemon2,
    t.game_id::TEXT    AS game_id
  FROM public.tournament_players tp
  JOIN public.tournaments t  ON t.id = tp.tournament_id
  JOIN public.workspaces  w  ON w.id = t.workspace_id
  LEFT JOIN public.tournament_standings ts ON ts.tournament_id = tp.tournament_id AND ts.player_id = tp.id
  LEFT JOIN field f  ON f.tournament_id = tp.tournament_id
  LEFT JOIN wins  wn ON wn.tournament_id = tp.tournament_id AND wn.player_id = tp.id
  WHERE tp.user_id = auth.uid()
  ORDER BY tp.created_at DESC;
END;
$function$;

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
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_player_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournaments_summary(UUID[], UUID[]) TO anon, authenticated;
