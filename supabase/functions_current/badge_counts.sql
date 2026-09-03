CREATE OR REPLACE FUNCTION public.badge_counts(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, badge_id text, badge_count integer, workspace_id uuid, workspace_name text, game_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH uw AS (
    SELECT DISTINCT tp.user_id AS uid, tp.workspace_id AS ws
    FROM public.tournament_players tp
    WHERE tp.user_id = ANY(p_user_ids)
  ),
  -- Every entry belonging to each account, including same-name walk-ins
  -- folded in by workspace_player_identities: a linked entry is keyed by its
  -- user_id, so an account's own key is the uuid as text.
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
      t.game_id::TEXT  AS game_id,
      ts.position::INT AS finish,
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
  -- The cut is the top eight, or the top four in a room too small for eight
  -- to mean anything. The eight-player floor is applied per badge below, not
  -- here: turning up to a six-player evening is still turning up.
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
  -- Spoiler needs the winner to have lost exactly once. If they went
  -- undefeated nobody earns it, which is what keeps it rare. HAVING
  -- guarantees one row, so the array has one element (MIN has no uuid
  -- overload).
  sole_losses AS (
    SELECT wl.tid, (ARRAY_AGG(wl.beater))[1] AS beater
    FROM winner_losses wl
    GROUP BY wl.tid
    HAVING COUNT(*) = 1
  ),

  -- Attendance describes the club, not the game: being a regular is true
  -- whichever night you come, so it carries no game and shows everywhere.
  attendance AS (
    SELECT
      s.uid,
      'attendance'::TEXT AS badge_id,
      COUNT(*)::INT      AS badge_count,
      s.workspace_id,
      (SELECT ws.name FROM public.workspaces ws WHERE ws.id = s.workspace_id)::TEXT AS workspace_name,
      NULL::TEXT         AS game_id
    FROM scored s
    GROUP BY s.uid, s.workspace_id
  ),
  top_cut AS (
    SELECT s.uid, 'top_cut'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8
      AND s.finish IS NOT NULL
      AND s.finish <= s.cut_size
    GROUP BY s.uid, s.game_id
  ),
  champion AS (
    SELECT s.uid, 'champion'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8 AND s.finish = 1
    GROUP BY s.uid, s.game_id
  ),
  bubble AS (
    SELECT s.uid, 'bubble'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    WHERE s.field_size >= 8 AND s.finish = s.cut_size + 1
    GROUP BY s.uid, s.game_id
  ),
  spoiler AS (
    SELECT s.uid, 'spoiler'::TEXT, COUNT(*)::INT, NULL::UUID, NULL::TEXT, s.game_id
    FROM scored s
    JOIN sole_losses sl ON sl.tid = s.tid AND sl.beater = s.tpid
    WHERE s.field_size >= 8
    GROUP BY s.uid, s.game_id
  )
  SELECT * FROM attendance
  UNION ALL SELECT * FROM top_cut
  UNION ALL SELECT * FROM champion
  UNION ALL SELECT * FROM spoiler
  UNION ALL SELECT * FROM bubble;
$function$
