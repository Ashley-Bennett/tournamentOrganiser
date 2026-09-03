CREATE OR REPLACE FUNCTION public.get_organiser_round_health(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(round_number integer, events integer, matches integer, timed_matches integer, median_minutes numeric, longest_minutes numeric, round_minutes numeric, clock_pct numeric, drops_at_round integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH chosen_events AS (
    SELECT DISTINCT i.tournament_id AS tid
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
  ),
  all_matches AS (
    SELECT tm.tournament_id, tm.round_number::INT AS rnd, tm.id, tm.result_recorded_at
    FROM public.tournament_matches tm
    JOIN chosen_events ce ON ce.tid = tm.tournament_id
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
  ),
  timed AS (
    SELECT
      am.rnd,
      am.tournament_id,
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (am.result_recorded_at - tr.started_at)) - tr.paused_seconds
      ) / 60.0 AS minutes,
      tr.duration_minutes
    FROM all_matches am
    JOIN public.tournament_rounds tr
      ON tr.tournament_id = am.tournament_id AND tr.round_number = am.rnd
    WHERE am.result_recorded_at IS NOT NULL
      AND am.result_recorded_at >= tr.started_at
  ),
  round_spans AS (
    -- How long the round itself ran, from its own record rather than from the
    -- last result: a round can be closed after the final result comes in.
    SELECT
      tr.round_number::INT AS rnd,
      (EXTRACT(EPOCH FROM (COALESCE(tr.ended_at, now()) - tr.started_at)) - tr.paused_seconds) / 60.0 AS minutes
    FROM public.tournament_rounds tr
    JOIN chosen_events ce ON ce.tid = tr.tournament_id
    WHERE tr.ended_at IS NOT NULL
  ),
  drops AS (
    SELECT tp.dropped_at_round::INT AS rnd, COUNT(*)::INT AS n
    FROM public.tournament_players tp
    JOIN chosen_events ce ON ce.tid = tp.tournament_id
    WHERE tp.dropped AND tp.dropped_at_round IS NOT NULL
    GROUP BY tp.dropped_at_round
  )
  SELECT
    am.rnd,
    COUNT(DISTINCT am.tournament_id)::INT,
    COUNT(*)::INT,
    (SELECT COUNT(*)::INT FROM timed t WHERE t.rnd = am.rnd),
    (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)::NUMERIC, 1)
       FROM timed t WHERE t.rnd = am.rnd),
    (SELECT ROUND(MAX(t.minutes)::NUMERIC, 1) FROM timed t WHERE t.rnd = am.rnd),
    (SELECT ROUND(AVG(rs.minutes)::NUMERIC, 1) FROM round_spans rs WHERE rs.rnd = am.rnd),
    -- Share of the configured clock the median game used. NULL when no round at
    -- this number had a timer set.
    (SELECT ROUND(
              (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)
               / NULLIF(AVG(t.duration_minutes), 0) * 100)::NUMERIC, 0)
       FROM timed t WHERE t.rnd = am.rnd AND t.duration_minutes IS NOT NULL),
    COALESCE((SELECT d.n FROM drops d WHERE d.rnd = am.rnd), 0)
  FROM all_matches am
  GROUP BY am.rnd
  ORDER BY am.rnd;
END;
$function$
