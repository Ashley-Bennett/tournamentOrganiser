CREATE OR REPLACE FUNCTION public.generate_join_code(p_game_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Unchanged from 20260719211839_medium_severity_fixes.sql.
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
  -- Short, concrete, unambiguous words for every other game. Read aloud
  -- across a noisy room and typed by hand, so nothing longer than eight
  -- letters and no near-homophones.
  neutral TEXT[] := ARRAY[
    'ANCHOR', 'AMBER', 'BEACON', 'BRONZE', 'CANYON', 'CASCADE',
    'CEDAR', 'COMET', 'COMPASS', 'COPPER', 'CORAL', 'DELTA',
    'DRIFTWOOD', 'ECHO', 'EMBER', 'FALCON', 'FOREST', 'FROST',
    'GLACIER', 'GRANITE', 'GROVE', 'HARBOUR', 'HOLLOW', 'INDIGO',
    'IRON', 'JASPER', 'JUNIPER', 'KESTREL', 'LANTERN', 'MAPLE',
    'MARBLE', 'MEADOW', 'MERIDIAN', 'NOVA', 'ONYX', 'ORBIT',
    'ORCHARD', 'PEBBLE', 'PRISM', 'QUARTZ', 'QUILL', 'RIPPLE',
    'RIVER', 'SAFFRON', 'SLATE', 'SUMMIT', 'THUNDER', 'TIMBER',
    'VELVET', 'VERTEX', 'WILLOW', 'ZEPHYR'
  ];
  words TEXT[];
  candidate TEXT;
  suffixed TEXT;
  attempts INT := 0;
BEGIN
  words := CASE WHEN p_game_id = 'pokemon' THEN pokemon ELSE neutral END;

  LOOP
    candidate := words[1 + floor(random() * array_length(words, 1))::int];
    IF NOT EXISTS (
      SELECT 1 FROM tournaments
      WHERE join_code = candidate AND status = 'draft'
    ) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN
      -- Fallback: try numeric suffixes, RE-CHECKING uniqueness each time
      -- (unchanged from #13 in 20260719211839).
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
$function$
