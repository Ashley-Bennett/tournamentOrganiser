-- Replace generate_join_code() with a cleaned, expanded Pokémon list.
-- Fixes truncated names (JIGGLYPUF, WIGGLYTUF, ELECTABUZ),
-- removes the duplicate VAPOREON, drops names with unusual spellings (JYNX etc.)
-- and adds ~100 more clean, phonetically straightforward names from Gen 1-3.

CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  attempts INT := 0;
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
      RETURN candidate || (floor(random() * 9) + 1)::text;
    END IF;
  END LOOP;
END;
$$;
