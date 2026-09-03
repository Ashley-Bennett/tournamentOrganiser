CREATE OR REPLACE FUNCTION public.enqueue_due_round_timeups()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r      RECORD;
  v_round INT;
BEGIN
  FOR r IN
    SELECT t.id, t.round_timeup_notified_round
    FROM public.tournaments t
    WHERE t.status = 'active'
      AND t.round_is_paused = false
      AND t.current_round_started_at IS NOT NULL
      AND t.round_duration_minutes IS NOT NULL
      AND now() >= t.current_round_started_at
          + make_interval(secs =>
              t.round_duration_minutes * 60 - COALESCE(t.round_elapsed_seconds, 0))
  LOOP
    -- Active round = highest round still being played.
    SELECT max(round_number) INTO v_round
    FROM public.tournament_matches
    WHERE tournament_id = r.id AND status = 'pending';

    IF v_round IS NULL THEN CONTINUE; END IF;
    IF r.round_timeup_notified_round IS NOT DISTINCT FROM v_round THEN CONTINUE; END IF;

    PERFORM public.invoke_send_push(jsonb_build_object(
      'type', 'time_up',
      'tournament_id', r.id,
      'round', v_round
    ));

    UPDATE public.tournaments
      SET round_timeup_notified_round = v_round
      WHERE id = r.id;
  END LOOP;
END;
$function$
