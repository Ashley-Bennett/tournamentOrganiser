CREATE OR REPLACE FUNCTION public.get_tournament_player_cards(p_tournament_id uuid)
 RETURNS TABLE(tournament_player_id uuid, partner_key text, slots jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_game_id      TEXT;
  v_public       BOOLEAN;
BEGIN
  SELECT t.workspace_id, t.game_id::TEXT
    INTO v_workspace_id, v_game_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'No such tournament';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.pairings_published = true
  ) INTO v_public;

  -- Once a round is on the board, the badges beside the names are as public
  -- as the pairing itself. Before that, members only.
  IF NOT v_public AND public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not visible';
  END IF;

  RETURN QUERY
  WITH entrants AS (
    SELECT tp.id AS tpid, tp.user_id AS uid
    FROM public.tournament_players tp
    WHERE tp.tournament_id = p_tournament_id
      AND tp.user_id IS NOT NULL
  ),
  equipped AS (
    SELECT
      e.tpid,
      s.slot,
      s.badge_id,
      s.workspace_id,
      COALESCE(pb.badge_count, 0) AS badge_count,
      (SELECT w.name FROM public.workspaces w WHERE w.id = s.workspace_id)::TEXT AS workspace_name
    FROM entrants e
    JOIN public.player_card_slot s
      ON s.user_id = e.uid AND s.game_id = v_game_id
    LEFT JOIN public.player_badge pb
      ON pb.user_id      = e.uid
     AND pb.badge_id     = s.badge_id
     AND pb.workspace_id IS NOT DISTINCT FROM s.workspace_id
     -- A per-game badge counts only for this event's game; a game-agnostic
     -- one carries no game and counts anywhere. Without this, a player with
     -- top cuts in two games matched both rows and appeared twice.
     AND (pb.game_id IS NULL OR pb.game_id = v_game_id)
  )
  SELECT
    e.tpid,
    (
      SELECT pc.partner_key
      FROM public.player_card pc
      WHERE pc.user_id = e.uid AND pc.game_id = v_game_id
    )::TEXT,
    COALESCE(
      (
        SELECT JSONB_AGG(
                 JSONB_BUILD_OBJECT(
                   'slot', q.slot,
                   'badgeId', q.badge_id,
                   'workspaceId', q.workspace_id,
                   'workspaceName', q.workspace_name,
                   'count', q.badge_count
                 )
                 ORDER BY q.slot
               )
        FROM equipped q
        WHERE q.tpid = e.tpid
      ),
      '[]'::JSONB
    )
  FROM entrants e;
END;
$function$
