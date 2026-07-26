-- ============================================================
-- Tournament metadata (2026-07-26) — Phase 1
--
-- Add optional descriptive fields to tournaments so organisers can
-- record when/where an event is and what format it uses, and players
-- can see those details on the join page:
--   starts_at    — scheduled start date/time
--   game_format  — free text (e.g. Standard, Expanded, GLC)
--   location     — venue name or "Online"
--   description  — free-text notes (entry fee, prizes, house rules)
--
-- Organisers write these via the existing tournaments UPDATE RLS
-- policy (workspace-scoped); no new write path. get_tournament_for_join
-- is extended so the (anon) join page can display them.
-- ============================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS starts_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS game_format TEXT,
  ADD COLUMN IF NOT EXISTS location    TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Modest length caps (organiser-authored, but keep them sane)
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_game_format_len CHECK (game_format IS NULL OR char_length(game_format) <= 50),
  ADD CONSTRAINT tournaments_location_len    CHECK (location    IS NULL OR char_length(location)    <= 120),
  ADD CONSTRAINT tournaments_description_len CHECK (description IS NULL OR char_length(description) <= 2000);

-- Extend the join-page RPC to expose the new fields to anonymous joiners.
-- DROP first: adding OUT columns changes the return type.
DROP FUNCTION IF EXISTS public.get_tournament_for_join(UUID);

CREATE OR REPLACE FUNCTION public.get_tournament_for_join(
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
  description      TEXT
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
    t.description::TEXT
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$$;
