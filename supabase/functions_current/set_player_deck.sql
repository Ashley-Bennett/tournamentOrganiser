CREATE OR REPLACE FUNCTION public.set_player_deck(p_tournament_id uuid, p_player_id uuid, p_device_token text, p_pokemon1 integer, p_pokemon2 integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate device_token or account ownership
  PERFORM public.assert_player_access(p_player_id, p_tournament_id, p_device_token);

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  UPDATE public.tournament_players
  SET deck_pokemon1 = p_pokemon1,
      deck_pokemon2 = p_pokemon2
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id;
END;
$function$
