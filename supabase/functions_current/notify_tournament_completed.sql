CREATE OR REPLACE FUNCTION public.notify_tournament_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_players UUID[];
BEGIN
  PERFORM public.invoke_send_push(JSONB_BUILD_OBJECT(
    'type', 'standings_ready',
    'tournament_id', NEW.id
  ));

  BEGIN
    -- Entrant ids rather than account ids: the push targets are
    -- keyed by tournament_player, and the browser being notified
    -- belongs to an entry rather than to a person.
    SELECT ARRAY_AGG(DISTINCT tp.id)
      INTO v_new_players
    FROM public.refresh_tournament_badges(NEW.id) r
    JOIN public.tournament_players tp
      ON tp.tournament_id = NEW.id AND tp.user_id = r.earner_id;

    IF v_new_players IS NOT NULL AND CARDINALITY(v_new_players) > 0 THEN
      PERFORM public.invoke_send_push(JSONB_BUILD_OBJECT(
        'type', 'badge_earned',
        'tournament_id', NEW.id,
        'player_ids', TO_JSONB(v_new_players)
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'badge refresh after tournament % failed: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$function$
