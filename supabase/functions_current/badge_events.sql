CREATE OR REPLACE FUNCTION public.badge_events(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, badge_id text, workspace_id uuid, game_id text, played_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH uw AS (
    SELECT DISTINCT tp.user_id AS uid, tp.workspace_id AS ws
    FROM public.tournament_players tp
    WHERE tp.user_id = ANY(p_user_ids)
  ),
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
      t.game_id::TEXT                     AS game_id,
      COALESCE(t.starts_at, t.created_at) AS played_at,
      ts.position::INT                    AS finish,
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
  sole_losses AS (
    SELECT wl.tid, (ARRAY_AGG(wl.beater))[1] AS beater
    FROM winner_losses wl
    GROUP BY wl.tid
    HAVING COUNT(*) = 1
  )
  -- Attendance describes the club, not the game, so it carries a workspace
  -- and no game. Everything else is the reverse.
  SELECT s.uid, 'attendance'::TEXT, s.workspace_id, NULL::TEXT, s.played_at
  FROM scored s
  UNION ALL
  SELECT s.uid, 'top_cut'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  WHERE s.field_size >= 8 AND s.finish IS NOT NULL AND s.finish <= s.cut_size
  UNION ALL
  SELECT s.uid, 'champion'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  WHERE s.field_size >= 8 AND s.finish = 1
  UNION ALL
  SELECT s.uid, 'bubble'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  WHERE s.field_size >= 8 AND s.finish = s.cut_size + 1
  UNION ALL
  SELECT s.uid, 'spoiler'::TEXT, NULL::UUID, s.game_id, s.played_at
  FROM scored s
  JOIN sole_losses sl ON sl.tid = s.tid AND sl.beater = s.tpid
  WHERE s.field_size >= 8;
$function$
