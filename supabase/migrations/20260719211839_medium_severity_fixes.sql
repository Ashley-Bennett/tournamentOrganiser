-- ============================================================
-- Medium-severity audit fixes (2026-07-19)
--
-- #9  get_player_tournament_view lost temp_result / temp_winner_id /
--     confirmed_by / report_count during the announcement→round_note
--     drop/restore churn (20260617000001/2 redefined the function from
--     a stale copy). PlayerTournamentView.tsx branches on all four, so
--     players stopped seeing pre-filled results, conflict states and
--     "Reported" badges. Restore the fields on the current shape
--     (round_note + deck columns).
--
-- #12 get_tournament_for_join returned the full registered player
--     name list for ANY tournament UUID, even with joining closed.
--     Names are only needed for duplicate-name validation on an open
--     join page, so return an empty array unless joining is possible.
--
-- #13 generate_join_code's fallback (candidate || digit) never
--     re-checked uniqueness, so a collision at the fallback path
--     would violate the partial unique index. Re-check each suffixed
--     candidate; final fallback is an effectively-unique hex code.
--
-- #18 add_known_players_to_tournament counted skipped rows
--     (ON CONFLICT DO NOTHING) as inserted. Count real insertions.
-- ============================================================

-- ---- #9: restore player-view result fields ------------------

CREATE OR REPLACE FUNCTION public.get_player_tournament_view(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player     RECORD;
  v_tournament RECORD;
  v_result     JSONB;
BEGIN
  -- Validate device_token
  SELECT id, name, dropped, dropped_at_round, deck_pokemon1, deck_pokemon2
  INTO v_player
  FROM public.tournament_players
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id
    AND device_token = p_device_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  -- Fetch tournament
  SELECT id, name, status, num_rounds,
         round_duration_minutes, current_round_started_at,
         round_elapsed_seconds, round_is_paused, round_note
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  SELECT jsonb_build_object(
    'tournament', jsonb_build_object(
      'id',                       v_tournament.id,
      'name',                     v_tournament.name,
      'status',                   v_tournament.status,
      'num_rounds',               v_tournament.num_rounds,
      'round_duration_minutes',   v_tournament.round_duration_minutes,
      'current_round_started_at', v_tournament.current_round_started_at,
      'round_elapsed_seconds',    v_tournament.round_elapsed_seconds,
      'round_is_paused',          v_tournament.round_is_paused,
      'round_note',               v_tournament.round_note
    ),
    'player', jsonb_build_object(
      'id',               v_player.id,
      'name',             v_player.name,
      'dropped',          v_player.dropped,
      'dropped_at_round', v_player.dropped_at_round,
      'deck_pokemon1',    v_player.deck_pokemon1,
      'deck_pokemon2',    v_player.deck_pokemon2
    ),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',               tp.id,
        'name',             tp.name,
        'dropped',          tp.dropped,
        'dropped_at_round', tp.dropped_at_round,
        'deck_pokemon1',    tp.deck_pokemon1,
        'deck_pokemon2',    tp.deck_pokemon2
      ))
      FROM public.tournament_players tp
      WHERE tp.tournament_id = p_tournament_id
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',                 m.id,
        'round_number',       m.round_number,
        'match_number',       m.match_number,
        'player1_id',         m.player1_id,
        'player1_name',       p1.name,
        'player2_id',         m.player2_id,
        'player2_name',       p2.name,
        'winner_id',          m.winner_id,
        'result',             m.result,
        'temp_result',        m.temp_result,
        'temp_winner_id',     m.temp_winner_id,
        'status',             m.status,
        'confirmed_by',       m.confirmed_by,
        'pairings_published', m.pairings_published,
        'is_my_match',        (m.player1_id = p_player_id OR m.player2_id = p_player_id),
        'report_count',       (
          SELECT COUNT(*)::int
          FROM public.match_result_reports r
          WHERE r.match_id = m.id
        )
      ) ORDER BY m.round_number ASC, m.match_number ASC NULLS LAST)
      FROM public.tournament_matches m
      JOIN public.tournament_players p1 ON p1.id = m.player1_id
      LEFT JOIN public.tournament_players p2 ON p2.id = m.player2_id
      WHERE m.tournament_id = p_tournament_id
        AND (m.pairings_published = true OR m.status IN ('pending', 'completed', 'bye'))
    ), '[]'::jsonb),
    'my_report', (
      SELECT jsonb_build_object('reported_outcome', r.reported_outcome)
      FROM public.match_result_reports r
      JOIN public.tournament_matches m ON m.id = r.match_id
      WHERE r.player_id = p_player_id
        AND m.tournament_id = p_tournament_id
        AND m.status IN ('ready', 'pending')
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_tournament_view(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_player_tournament_view(UUID, UUID, TEXT) TO authenticated;

-- ---- #12: only expose names while joining is open -----------

CREATE OR REPLACE FUNCTION public.get_tournament_for_join(
  p_tournament_id UUID
)
RETURNS TABLE(
  tournament_name  TEXT,
  status           TEXT,
  join_enabled     BOOLEAN,
  registered_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.name::TEXT,
    t.status::TEXT,
    t.join_enabled,
    CASE
      WHEN t.join_enabled AND t.status = 'draft' THEN
        COALESCE(
          ARRAY(
            SELECT tp.name
            FROM public.tournament_players tp
            WHERE tp.tournament_id = p_tournament_id
            ORDER BY tp.created_at
          ),
          '{}'::TEXT[]
        )
      ELSE '{}'::TEXT[]
    END
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$$;

-- ---- #13: join-code fallback must stay unique ---------------

CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- List unchanged from 20260326000004_clean_pokemon_list.sql;
  -- only the fallback logic below is fixed.
  pokemon TEXT[] := ARRAY[
    -- Gen 1
    'BULBASAUR', 'IVYSAUR', 'VENUSAUR',
    'CHARMANDER', 'CHARMELEON', 'CHARIZARD',
    'SQUIRTLE', 'WARTORTLE', 'BLASTOISE',
    'CATERPIE', 'METAPOD', 'BUTTERFREE',
    'WEEDLE', 'KAKUNA', 'BEEDRILL',
    'PIDGEY', 'PIDGEOT',
    'RATTATA', 'RATICATE',
    'SPEAROW', 'FEAROW',
    'SANDSHREW', 'SANDSLASH',
    'NIDORINA', 'NIDOQUEEN', 'NIDORINO', 'NIDOKING',
    'CLEFAIRY', 'CLEFABLE',
    'VULPIX', 'NINETALES',
    'JIGGLYPUFF', 'WIGGLYTUFF',
    'ZUBAT', 'GOLBAT',
    'ODDISH', 'GLOOM', 'VILEPLUME',
    'PARAS', 'PARASECT',
    'DIGLETT', 'DUGTRIO',
    'MEOWTH', 'PERSIAN',
    'PSYDUCK', 'GOLDUCK',
    'MANKEY', 'PRIMEAPE',
    'GROWLITHE', 'ARCANINE',
    'POLIWAG', 'POLIWHIRL', 'POLIWRATH',
    'ABRA', 'KADABRA', 'ALAKAZAM',
    'MACHOP', 'MACHOKE', 'MACHAMP',
    'BELLSPROUT',
    'GEODUDE', 'GRAVELER', 'GOLEM',
    'PONYTA', 'RAPIDASH',
    'SLOWPOKE', 'SLOWBRO',
    'DODUO', 'DODRIO',
    'SEEL', 'DEWGONG',
    'GRIMER', 'MUK',
    'SHELLDER', 'CLOYSTER',
    'GASTLY', 'HAUNTER', 'GENGAR',
    'ONIX',
    'DROWZEE', 'HYPNO',
    'KRABBY', 'KINGLER',
    'VOLTORB', 'ELECTRODE',
    'CUBONE', 'MAROWAK',
    'HITMONLEE', 'HITMONCHAN',
    'RHYHORN', 'RHYDON',
    'CHANSEY',
    'TANGELA',
    'HORSEA', 'SEADRA',
    'GOLDEEN', 'SEAKING',
    'STARYU', 'STARMIE',
    'SCYTHER',
    'ELECTABUZZ', 'MAGMAR',
    'PINSIR', 'TAUROS',
    'MAGIKARP', 'GYARADOS',
    'LAPRAS', 'DITTO',
    'EEVEE', 'VAPOREON', 'JOLTEON', 'FLAREON',
    'PORYGON',
    'OMANYTE', 'OMASTAR',
    'KABUTO', 'KABUTOPS',
    'AERODACTYL', 'SNORLAX',
    'ARTICUNO', 'ZAPDOS', 'MOLTRES',
    'DRATINI', 'DRAGONAIR', 'DRAGONITE',
    'MEWTWO', 'MEW',
    -- Gen 2
    'CHIKORITA', 'BAYLEEF', 'MEGANIUM',
    'CYNDAQUIL', 'QUILAVA', 'TYPHLOSION',
    'TOTODILE', 'CROCONAW',
    'SENTRET', 'FURRET',
    'HOOTHOOT', 'NOCTOWL',
    'PICHU', 'CLEFFA', 'IGGLYBUFF',
    'TOGEPI', 'TOGETIC',
    'MAREEP', 'FLAAFFY', 'AMPHAROS',
    'MARILL', 'AZUMARILL',
    'SUDOWOODO',
    'HOPPIP', 'SKIPLOOM', 'JUMPLUFF',
    'AIPOM',
    'WOOPER', 'QUAGSIRE',
    'ESPEON', 'UMBREON',
    'MURKROW',
    'SLOWKING',
    'GLIGAR',
    'STEELIX',
    'SNUBBULL', 'GRANBULL',
    'HERACROSS',
    'SNEASEL',
    'TEDDIURSA', 'URSARING',
    'SLUGMA', 'MAGCARGO',
    'SWINUB', 'PILOSWINE',
    'CORSOLA',
    'DELIBIRD',
    'SKARMORY',
    'HOUNDOUR', 'HOUNDOOM',
    'KINGDRA',
    'PHANPY', 'DONPHAN',
    'STANTLER',
    'MILTANK', 'BLISSEY',
    'RAIKOU', 'ENTEI', 'SUICUNE',
    'LARVITAR', 'PUPITAR', 'TYRANITAR',
    'LUGIA', 'CELEBI',
    -- Gen 3
    'TREECKO', 'GROVYLE', 'SCEPTILE',
    'TORCHIC', 'BLAZIKEN',
    'MUDKIP', 'MARSHTOMP', 'SWAMPERT',
    'LOTAD', 'LOMBRE',
    'TAILLOW', 'SWELLOW',
    'RALTS', 'KIRLIA', 'GARDEVOIR',
    'SHROOMISH', 'BRELOOM',
    'MAKUHITA', 'HARIYAMA',
    'ROSELIA',
    'TORKOAL',
    'SPINDA',
    'TRAPINCH', 'VIBRAVA', 'FLYGON',
    'CACNEA', 'CACTURNE',
    'ALTARIA',
    'ZANGOOSE', 'SEVIPER',
    'LUNATONE', 'SOLROCK',
    'ABSOL',
    'SNORUNT', 'GLALIE',
    'SPHEAL', 'SEALEO', 'WALREIN',
    'BAGON', 'SHELGON', 'SALAMENCE',
    'BELDUM', 'METANG', 'METAGROSS',
    'REGIROCK', 'REGICE', 'REGISTEEL',
    'LATIAS', 'LATIOS',
    'KYOGRE', 'GROUDON', 'RAYQUAZA',
    'JIRACHI'
  ];
  candidate TEXT;
  suffixed  TEXT;
  attempts  INT := 0;
BEGIN
  LOOP
    candidate := pokemon[1 + floor(random() * array_length(pokemon, 1))::int];
    IF NOT EXISTS (
      SELECT 1 FROM tournaments
      WHERE join_code = candidate AND status = 'draft'
    ) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN
      -- Fallback: try numeric suffixes, RE-CHECKING uniqueness each time
      -- (the old fallback returned candidate || digit unchecked, which could
      -- violate the partial unique index on (join_code) WHERE status='draft').
      FOR i IN 1..99 LOOP
        suffixed := candidate || i::text;
        IF NOT EXISTS (
          SELECT 1 FROM tournaments
          WHERE join_code = suffixed AND status = 'draft'
        ) THEN
          RETURN suffixed;
        END IF;
      END LOOP;
      -- Last resort: effectively unique random hex
      RETURN 'CODE' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;
  END LOOP;
END;
$$;

-- ---- #18: report the real inserted count --------------------

CREATE OR REPLACE FUNCTION public.add_known_players_to_tournament(
  p_tournament_id UUID,
  p_user_ids      UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_uid          UUID;
  v_name         TEXT;
  v_inserted     INTEGER := 0;
  v_rows         INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF public.get_workspace_role(v_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can add known players';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_players
      WHERE workspace_id = v_workspace_id AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'User % is not a known player in this workspace', v_uid;
    END IF;

    SELECT COALESCE(wp.preferred_name, p.display_name, 'Player')
    INTO v_name
    FROM public.workspace_players wp
    LEFT JOIN public.profiles p ON p.id = wp.user_id
    WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid;

    INSERT INTO public.tournament_players (tournament_id, workspace_id, user_id, name, created_by)
    VALUES (p_tournament_id, v_workspace_id, v_uid, v_name, auth.uid())
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END LOOP;

  RETURN v_inserted;
END;
$$;
