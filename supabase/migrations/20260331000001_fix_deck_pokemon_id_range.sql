-- Fix set_player_deck to accept form IDs (Megas, regional forms, Gigantamax etc.)
-- which PokéAPI assigns IDs starting at 10001+. Previous limit of 1025 blocked
-- all alternate forms. Upper bound of 99999 covers all current and near-future IDs.

CREATE OR REPLACE FUNCTION public.set_player_deck(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT,
  p_pokemon1      INTEGER,
  p_pokemon2      INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate credentials
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = p_player_id
      AND tournament_id = p_tournament_id
      AND device_token = p_device_token
  ) THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.set_player_deck(UUID, UUID, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.set_player_deck(UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated;
