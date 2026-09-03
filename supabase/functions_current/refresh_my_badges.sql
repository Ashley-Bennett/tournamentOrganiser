CREATE OR REPLACE FUNCTION public.refresh_my_badges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH fresh AS (
    SELECT
      e.user_id,
      e.badge_id,
      e.workspace_id,
      e.game_id,
      COUNT(*)::INT AS badge_count,
      -- Capped: a decade of weekly attendance is ~500 dates and the badge
      -- case only ever reads the ones a threshold lands on.
      TO_JSONB(
        (ARRAY_AGG(e.played_at ORDER BY e.played_at))[1:200]
      ) AS earned_at
    FROM public.badge_events(ARRAY[auth.uid()]) e
    GROUP BY e.user_id, e.badge_id, e.workspace_id, e.game_id
  ),
  wiped AS (
    -- Anything no longer earned — an event deleted, a merge undone — must go,
    -- or a stale row would outlive the history that justified it.
    DELETE FROM public.player_badge pb
    WHERE pb.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM fresh f
        WHERE f.badge_id = pb.badge_id
          AND f.workspace_id IS NOT DISTINCT FROM pb.workspace_id
          AND f.game_id      IS NOT DISTINCT FROM pb.game_id
      )
    RETURNING 1
  ),
  written AS (
    INSERT INTO public.player_badge
      (user_id, badge_id, workspace_id, game_id, badge_count, earned_at, updated_at)
    SELECT f.user_id, f.badge_id, f.workspace_id, f.game_id, f.badge_count, f.earned_at, NOW()
    FROM fresh f
    ON CONFLICT (user_id, badge_id, workspace_id, game_id) DO UPDATE
      SET badge_count = EXCLUDED.badge_count,
          earned_at   = EXCLUDED.earned_at,
          updated_at  = NOW()
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_rows FROM written;

  RETURN v_rows;
END;
$function$
