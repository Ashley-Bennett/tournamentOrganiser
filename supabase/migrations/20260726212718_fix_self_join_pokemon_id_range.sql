-- ============================================================
-- Fix self_join_tournament Pokémon ID range (2026-07-26)
--
-- self_join_tournament (20260721120312) validated deck Pokémon
-- IDs as 1–1025, but PokéAPI assigns form IDs (Mega / regional /
-- Gigantamax) starting at 10001+. This rejected any alternate
-- form during self-registration with "Invalid pokemon id"
-- (e.g. Mega Venusaur = 10033), even though set_player_deck was
-- already fixed to allow up to 99999 in 20260331000001.
--
-- Align the upper bound with set_player_deck (99999). Function
-- body is otherwise unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.self_join_tournament(
  p_tournament_id UUID,
  p_player_name   TEXT,
  p_device_id     TEXT DEFAULT NULL,
  p_pokemon1      INTEGER DEFAULT NULL,
  p_pokemon2      INTEGER DEFAULT NULL
)
RETURNS TABLE(player_id UUID, device_token TEXT, tournament_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id    UUID;
  v_status          TEXT;
  v_join_enabled    BOOLEAN;
  v_tournament_name TEXT;
  v_player_id       UUID;
  v_device_token    TEXT;
  v_trimmed_name    TEXT;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  SELECT t.workspace_id, t.status, t.join_enabled, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT v_join_enabled THEN
    RAISE EXCEPTION 'Registration is not open for this tournament';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  -- Case-insensitive duplicate name check
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

  INSERT INTO public.tournament_players (
    tournament_id, workspace_id, name, device_token, device_id,
    deck_pokemon1, deck_pokemon2
  )
  VALUES (
    p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    p_pokemon1, p_pokemon2
  )
  RETURNING id INTO v_player_id;

  RETURN QUERY SELECT v_player_id, v_device_token, v_tournament_name::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
