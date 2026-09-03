CREATE OR REPLACE FUNCTION public.self_join_tournament(p_tournament_id uuid, p_player_name text, p_device_id text DEFAULT NULL::text, p_pokemon1 integer DEFAULT NULL::integer, p_pokemon2 integer DEFAULT NULL::integer, p_confirmed_distinct boolean DEFAULT false)
 RETURNS TABLE(player_id uuid, device_token text, tournament_name text, duplicate_of text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id     UUID;
  v_status           TEXT;
  v_join_enabled     BOOLEAN;
  v_allow_late_join  BOOLEAN;
  v_until_round      INTEGER;
  v_tournament_name  TEXT;
  v_player_id        UUID;
  v_device_token     TEXT;
  v_trimmed_name     TEXT;
  v_is_late_entry    BOOLEAN := FALSE;
  v_current_round    INTEGER;
  v_duplicate_of     TEXT;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  IF length(v_trimmed_name) > 50 THEN
    RAISE EXCEPTION 'Player name is too long (max 50 characters)';
  END IF;

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  -- Lock the tournament so concurrent joins serialise: without this, two players
  -- scanning the QR at the same moment could both absorb the same waiting bye.
  SELECT t.workspace_id, t.status, t.join_enabled, t.allow_late_join,
         t.late_join_until_round, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_allow_late_join,
       v_until_round, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_status = 'draft' THEN
    IF NOT v_join_enabled THEN
      RAISE EXCEPTION 'Registration is not open for this tournament';
    END IF;

  ELSIF v_status = 'active' THEN
    IF NOT v_allow_late_join THEN
      RAISE EXCEPTION 'Registration is closed';
    END IF;

    v_is_late_entry := TRUE;

    SELECT COALESCE(MAX(m.round_number), 1) INTO v_current_round
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id;

    -- Optional cutoff. NULL means no limit.
    IF v_until_round IS NOT NULL AND v_current_round > v_until_round THEN
      RAISE EXCEPTION 'Late entry closed after round %', v_until_round;
    END IF;

  ELSE
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  -- Does the organiser look to have signed this person up already? Ask, don't
  -- refuse — and write nothing until we have an answer.
  IF NOT p_confirmed_distinct THEN
    v_duplicate_of := public._find_possible_duplicate_entry(
      p_tournament_id, v_trimmed_name
    );

    IF v_duplicate_of IS NOT NULL THEN
      RETURN QUERY SELECT
        NULL::UUID, NULL::TEXT, v_tournament_name::TEXT, v_duplicate_of;
      RETURN;
    END IF;
  END IF;

  -- Case-insensitive duplicate name check. Still absolute: even a confirmed
  -- different person cannot take a name that is already in the tournament.
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND lower(name) = lower(v_trimmed_name)
  ) THEN
    RAISE EXCEPTION 'A player with that name is already registered';
  END IF;

  -- Generate a 64-char hex token using gen_random_uuid() (no pgcrypto path issues)
  v_device_token := replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '');

  -- Pre-generate the id so the audit row for this INSERT carries the actor
  -- label as well. The trigger fires during the INSERT, so a label set from
  -- a RETURNING value afterwards would arrive one row too late.
  v_player_id := gen_random_uuid();
  PERFORM public.set_audit_actor('player:' || v_player_id);

  INSERT INTO public.tournament_players (
    id, tournament_id, workspace_id, name, device_token, device_id,
    deck_pokemon1, deck_pokemon2, user_id, is_late_entry, late_entry_round
  )
  VALUES (
    v_player_id, p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    p_pokemon1, p_pokemon2,
    auth.uid(),  -- NULL for anonymous, user id for authenticated (auto-link)
    v_is_late_entry,
    CASE WHEN v_is_late_entry THEN v_current_round ELSE NULL END
  );

  IF v_is_late_entry THEN
    PERFORM public._apply_late_entry_pairing_unchecked(v_player_id, p_tournament_id);
  END IF;

  RETURN QUERY SELECT
    v_player_id, v_device_token, v_tournament_name::TEXT, NULL::TEXT;
END;
$function$
