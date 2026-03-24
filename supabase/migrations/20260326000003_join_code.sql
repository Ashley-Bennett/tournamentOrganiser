-- Add join_code column to tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS join_code TEXT;

-- Unique partial index: only one active tournament per code at a time
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_join_code_active_unique
  ON tournaments (join_code)
  WHERE join_code IS NOT NULL AND status = 'draft';

-- Internal function: pick a unique Pokémon-based code
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pokemon TEXT[] := ARRAY[
    'MEW', 'MEWTWO', 'EEVEE', 'JOLTEON', 'VAPOREON', 'FLAREON',
    'GENGAR', 'HAUNTER', 'GASTLY', 'PIKACHU', 'RAICHU', 'PICHU',
    'SNORLAX', 'MUNCHLAX', 'JIGGLYPUF', 'WIGGLYTUF', 'CLEFAIRY',
    'CLEFABLE', 'VULPIX', 'NINETALES', 'GROWLITHE', 'ARCANINE',
    'PSYDUCK', 'GOLDUCK', 'SLOWPOKE', 'SLOWBRO', 'ABRA', 'KADABRA',
    'ALAKAZAM', 'GEODUDE', 'GRAVELER', 'GOLEM', 'ONIX', 'STEELIX',
    'MACHOP', 'MACHOKE', 'MACHAMP', 'TENTACOOL', 'MAGNEMITE',
    'MAGNETON', 'DODUO', 'DODRIO', 'SEEL', 'DEWGONG', 'GRIMER',
    'MUK', 'SHELLDER', 'CLOYSTER', 'DROWZEE', 'HYPNO', 'KRABBY',
    'KINGLER', 'VOLTORB', 'ELECTRODE', 'CUBONE', 'MAROWAK',
    'HITMONLEE', 'HITMONCHAN', 'LICKITUNG', 'KOFFING', 'WEEZING',
    'RHYHORN', 'RHYDON', 'CHANSEY', 'TANGELA', 'KANGASKHAN',
    'HORSEA', 'SEADRA', 'GOLDEEN', 'SEAKING', 'STARYU', 'STARMIE',
    'SCYTHER', 'JYNX', 'ELECTABUZ', 'MAGMAR', 'PINSIR', 'TAUROS',
    'MAGIKARP', 'GYARADOS', 'LAPRAS', 'DITTO', 'VAPOREON', 'PORYGON',
    'OMANYTE', 'OMASTAR', 'KABUTO', 'KABUTOPS', 'AERODACTYL',
    'DRATINI', 'DRAGONAIR', 'DRAGONITE', 'ARTICUNO', 'ZAPDOS', 'MOLTRES'
  ];
  candidate TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    candidate := pokemon[1 + floor(random() * array_length(pokemon, 1))::int];
    -- Check if this code is currently in use by an active draft tournament
    IF NOT EXISTS (
      SELECT 1 FROM tournaments
      WHERE join_code = candidate AND status = 'draft'
    ) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN
      -- Fallback: append a number suffix
      RETURN candidate || (floor(random() * 9) + 1)::text;
    END IF;
  END LOOP;
END;
$$;

-- RPC: enable or disable self-registration (generates code on first enable)
CREATE OR REPLACE FUNCTION set_tournament_join_enabled(
  p_tournament_id UUID,
  p_enabled BOOLEAN
)
RETURNS TABLE (join_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_code TEXT;
  v_new_code TEXT;
  v_organiser_id UUID;
BEGIN
  -- Verify caller is the tournament organiser
  SELECT created_by INTO v_organiser_id
  FROM tournaments
  WHERE id = p_tournament_id;

  IF v_organiser_id IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_organiser_id != auth.uid() THEN
    -- Check workspace manager access
    IF NOT EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN tournaments t ON t.workspace_id = wm.workspace_id
      WHERE t.id = p_tournament_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'manager')
    ) THEN
      RAISE EXCEPTION 'Unauthorised';
    END IF;
  END IF;

  IF p_enabled THEN
    -- Reuse existing code or generate a new one
    SELECT t.join_code INTO v_existing_code
    FROM tournaments t
    WHERE t.id = p_tournament_id;

    IF v_existing_code IS NULL THEN
      v_new_code := generate_join_code();
    ELSE
      v_new_code := v_existing_code;
    END IF;

    UPDATE tournaments
    SET join_enabled = TRUE, join_code = v_new_code
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_new_code;
  ELSE
    UPDATE tournaments
    SET join_enabled = FALSE
    WHERE id = p_tournament_id;

    -- Return existing code (keeps it for display reference)
    SELECT t.join_code INTO v_existing_code
    FROM tournaments t
    WHERE t.id = p_tournament_id;

    RETURN QUERY SELECT v_existing_code;
  END IF;
END;
$$;

-- Grant execute to authenticated users (auth check is inside the function)
GRANT EXECUTE ON FUNCTION set_tournament_join_enabled(UUID, BOOLEAN) TO authenticated;

-- RPC: resolve a room code to a tournament (public, no auth required)
CREATE OR REPLACE FUNCTION resolve_join_code(p_code TEXT)
RETURNS TABLE (tournament_id UUID, tournament_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name
  FROM tournaments t
  WHERE upper(t.join_code) = upper(p_code)
    AND t.status = 'draft'
    AND t.join_enabled = TRUE
  LIMIT 1;
END;
$$;

-- Grant execute to anonymous users so the /join landing page works
GRANT EXECUTE ON FUNCTION resolve_join_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION resolve_join_code(TEXT) TO authenticated;
