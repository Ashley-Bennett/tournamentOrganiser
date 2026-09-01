-- ============================================================
-- Multi-game tournaments (2026-09-01) — 1.0 Phase A
--
-- Until now every tournament was implicitly Pokémon: the create
-- dialog hardcoded Swiss, and game_format was free text shown on
-- the join page. Introduce an explicit game identity so the app
-- can offer other TCGs and a rules-light "generic" mode:
--
--   game_id       — which game the event is for ('pokemon', 'generic', …)
--   game_format   — reused as the *format code* within that game
--                   ('standard' | 'expanded' | 'glc' for Pokémon);
--                   still free text for games without formats
--   tournament_type — widened to allow 'round_robin'
--
-- Deliberately NOT a lookup table. Formats rotate (Standard changes
-- yearly) and adding a game should not require a migration; the
-- frontend games registry is the source of truth for what is valid,
-- and the column stays a loosely-validated slug.
--
-- NOTE for later phases: tournament_players has a column-scoped
-- SELECT grant (see 20260719205753), so a future deck_label column
-- there must be paired with GRANT SELECT (deck_label). Columns added
-- to tournaments are unaffected — it has a table-level grant.
-- ============================================================

-- ---- 1. game_id --------------------------------------------

-- Added nullable first so the backfill decides every existing row's
-- value explicitly, rather than briefly labelling live Pokémon events
-- as generic.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS game_id TEXT;

-- Every tournament that exists today is a Pokémon event.
UPDATE public.tournaments SET game_id = 'pokemon' WHERE game_id IS NULL;

ALTER TABLE public.tournaments
  ALTER COLUMN game_id SET DEFAULT 'generic',
  ALTER COLUMN game_id SET NOT NULL;

-- Shape check only. The registry decides which slugs actually exist;
-- this just keeps the column a slug and bounds its length.
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_game_id_slug
    CHECK (game_id ~ '^[a-z0-9_]{1,32}$');

-- ---- 2. Allow round robin ----------------------------------

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_tournament_type_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_tournament_type_check
    CHECK (tournament_type IN ('swiss', 'round_robin', 'single_elimination'));

-- ---- 3. Normalise existing formats -------------------------

-- game_format was organiser-typed free text. Fold the values that map
-- onto known Pokémon format codes; anything unrecognised is left alone
-- so no organiser's notes are destroyed.
UPDATE public.tournaments
SET game_format = lower(btrim(game_format))
WHERE game_id = 'pokemon'
  AND game_format IS NOT NULL
  AND lower(btrim(game_format)) IN ('standard', 'expanded', 'glc');

-- ---- 4. Expose game_id to the join page --------------------

-- Rebuilt from 20260825150000 (late-join reporting) with game_id appended,
-- so the join page can show which game the event is for. DROP first: adding
-- an OUT column changes the return type, which also drops the EXECUTE grant.

DROP FUNCTION IF EXISTS public.get_tournament_for_join(UUID);

CREATE FUNCTION public.get_tournament_for_join(
  p_tournament_id UUID
)
RETURNS TABLE(
  tournament_name  TEXT,
  status           TEXT,
  join_enabled     BOOLEAN,
  registered_names TEXT[],
  starts_at        TIMESTAMPTZ,
  game_format      TEXT,
  location         TEXT,
  description      TEXT,
  allow_late_join  BOOLEAN,
  current_round    INTEGER,
  round_in_progress BOOLEAN,
  game_id          TEXT
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
    END,
    t.starts_at,
    t.game_format::TEXT,
    t.location::TEXT,
    t.description::TEXT,
    -- Only advertise late join while the cutoff (if any) still allows it.
    (
      t.allow_late_join
      AND t.status = 'active'
      AND (
        t.late_join_until_round IS NULL
        OR COALESCE((
          SELECT MAX(m.round_number) FROM public.tournament_matches m
          WHERE m.tournament_id = p_tournament_id
        ), 1) <= t.late_join_until_round
      )
    ),
    COALESCE((
      SELECT MAX(m.round_number) FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
    ), 1),
    COALESCE((
      SELECT BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL))
      FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
        AND m.round_number = (
          SELECT MAX(m2.round_number) FROM public.tournament_matches m2
          WHERE m2.tournament_id = p_tournament_id
        )
    ), FALSE),
    t.game_id::TEXT
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_for_join(UUID) TO anon, authenticated;
