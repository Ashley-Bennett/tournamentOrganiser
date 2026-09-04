CREATE OR REPLACE FUNCTION public.refresh_tournament_badges(p_tournament_id uuid)
 RETURNS TABLE(earner_id uuid, earned_badge_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT tp.user_id)
    INTO v_ids
  FROM public.tournament_players tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.user_id IS NOT NULL;

  -- An event of walk-ins with no accounts is the common case and
  -- is not an error.
  IF v_ids IS NULL OR CARDINALITY(v_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH before AS (
    -- Snapshot first: the INSERT below is what we are comparing
    -- against, so it has to be read before anything is written.
    SELECT DISTINCT pb.user_id, pb.badge_id
    FROM public.player_badge pb
    WHERE pb.user_id = ANY(v_ids)
  ),
  fresh AS (
    SELECT
      e.user_id,
      e.badge_id,
      e.workspace_id,
      e.game_id,
      COUNT(*)::INT AS badge_count,
      -- Capped the same way refresh_my_badges caps it: a decade of
      -- weekly attendance is ~500 dates and the badge case only
      -- ever reads the ones a threshold lands on.
      TO_JSONB(
        (ARRAY_AGG(e.played_at ORDER BY e.played_at))[1:200]
      ) AS earned_at
    FROM public.badge_events(v_ids) e
    GROUP BY e.user_id, e.badge_id, e.workspace_id, e.game_id
  ),
  wiped AS (
    -- Anything no longer earned must go, or a stale row would
    -- outlive the history that justified it.
    DELETE FROM public.player_badge pb
    WHERE pb.user_id = ANY(v_ids)
      AND NOT EXISTS (
        SELECT 1 FROM fresh f
        WHERE f.user_id      = pb.user_id
          AND f.badge_id     = pb.badge_id
          AND f.workspace_id IS NOT DISTINCT FROM pb.workspace_id
          AND f.game_id      IS NOT DISTINCT FROM pb.game_id
      )
    RETURNING 1
  ),
  written AS (
    INSERT INTO public.player_badge
      (user_id, badge_id, workspace_id, game_id, badge_count, earned_at, updated_at)
    SELECT f.user_id, f.badge_id, f.workspace_id, f.game_id,
           f.badge_count, f.earned_at, NOW()
    FROM fresh f
    ON CONFLICT (user_id, badge_id, workspace_id, game_id) DO UPDATE
      SET badge_count = EXCLUDED.badge_count,
          earned_at   = EXCLUDED.earned_at,
          updated_at  = NOW()
    RETURNING player_badge.user_id, player_badge.badge_id
  )
  SELECT DISTINCT w.user_id, w.badge_id
  FROM written w
  WHERE NOT EXISTS (
    SELECT 1 FROM before b
    WHERE b.user_id = w.user_id AND b.badge_id = w.badge_id
  );
END;
$function$
