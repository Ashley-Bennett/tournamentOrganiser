-- ============================================================
-- Player card: what a player has chosen to show (2026-09-02)
--
-- NOT YET ENABLED. Nothing writes these and nothing reads them. They
-- ship ahead of the UI so the shape can settle before anything depends
-- on it.
--
-- Badges themselves are derived from history (see get_my_badges) and
-- are never stored. These tables hold only the player's *choices*,
-- which nothing can compute.
--
-- Everything is per game. A Champion of a chess evening must not show
-- at a Pokemon event, and the partner is not a shared idea either: a
-- Pokemon card carries a species sprite, a generic one might carry a
-- chess piece or a football, and another TCG its own mascot. So the
-- card is keyed (user_id, game_id) throughout, and editing yours means
-- picking a game first.
--
-- A card only exists for a game once you have entered an event of that
-- type — get_my_card_games below is what the account page lists, so a
-- player who has only ever played Pokemon is never offered a generic
-- card to fill in.
--
-- partner_key is deliberately TEXT rather than a Pokemon id. What it
-- means is the game's business: "132" for Pokemon, something like
-- "chess-knight" elsewhere. The frontend games registry interprets it,
-- the same way it already owns formats and scoring.
--
-- Slot 0 is the worn title; slots 1-3 are the badge icons. A per-league
-- badge carries the workspace it was earned at, because a player can be
-- a Regular at two clubs and the card has to say which one.
--
-- Validity is not enforced here. Whether a badge id exists, and whether
-- the player has actually earned it, are both decided by the frontend
-- registry and get_my_badges — the database would have to duplicate the
-- registry to check, and would then be a second place to keep it right.
-- A stale row renders as nothing rather than as a lie.
-- ============================================================

DROP TABLE IF EXISTS public.player_card_slot;
DROP TABLE IF EXISTS public.player_card;

CREATE TABLE public.player_card (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id     TEXT NOT NULL,
  -- NULL means the game's default partner, which the client supplies.
  partner_key TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE public.player_card_slot (
  user_id      UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id      TEXT     NOT NULL,
  -- 0 = the worn title, 1-3 = badge icons, left to right.
  slot         SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 3),
  badge_id     TEXT     NOT NULL,
  -- The league this badge was earned at, for a per-league badge. NULL for a
  -- system badge, which is the same everywhere.
  workspace_id UUID     REFERENCES public.workspaces(id) ON DELETE CASCADE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id, slot)
);

CREATE INDEX player_card_slot_user_game_idx
  ON public.player_card_slot (user_id, game_id);

ALTER TABLE public.player_card      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_card_slot ENABLE ROW LEVEL SECURITY;

-- Own rows only, for now. Showing someone else's card on a pairing board is a
-- read path for device-token viewers with no account, so it needs a
-- SECURITY DEFINER function rather than a policy — that arrives with the UI.
CREATE POLICY player_card_own ON public.player_card
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY player_card_slot_own ON public.player_card_slot
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_card      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_card_slot TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_my_card_games
--
-- The games this account has actually entered an event for, newest first.
-- The account page lists one card per row here: there is no point offering a
-- generic card to somebody who only plays Pokemon.
--
-- Entering is enough — the card should be there to fill in on the way home
-- from your first event, not withheld until it has been scored.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_card_games()
RETURNS TABLE(
  game_id     TEXT,
  entries     INT,
  last_played TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    t.game_id::TEXT,
    COUNT(*)::INT,
    MAX(COALESCE(t.starts_at, t.created_at))
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.user_id = auth.uid()
    AND t.game_id IS NOT NULL
  GROUP BY t.game_id
  ORDER BY MAX(COALESCE(t.starts_at, t.created_at)) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_card_games() TO authenticated;
