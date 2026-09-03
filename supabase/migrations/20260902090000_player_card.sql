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
-- Two levels, deliberately:
--
--   player_card       — account-level. The partner Pokemon is expression
--                       rather than achievement: it is your partner, not
--                       your Pokemon-partner, so it travels between games.
--
--   player_card_slot  — per game. A Champion of a chess evening must not
--                       show at a Pokemon event, so the title and badges
--                       you wear are chosen per game. Editing your card
--                       means picking a game first.
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

CREATE TABLE IF NOT EXISTS public.player_card (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL means the default partner, which the client renders as Ditto.
  partner_pokemon_id INT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.player_card_slot (
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id      TEXT    NOT NULL,
  -- 0 = the worn title, 1-3 = badge icons, left to right.
  slot         SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 3),
  badge_id     TEXT    NOT NULL,
  -- The league this badge was earned at, for a per-league badge. NULL for a
  -- system badge, which is the same everywhere.
  workspace_id UUID    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id, slot)
);

CREATE INDEX IF NOT EXISTS player_card_slot_user_game_idx
  ON public.player_card_slot (user_id, game_id);

ALTER TABLE public.player_card      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_card_slot ENABLE ROW LEVEL SECURITY;

-- Own rows only, for now. Showing someone else's card on a pairing board is a
-- read path for device-token viewers with no account, so it needs a
-- SECURITY DEFINER function rather than a policy — that arrives with the UI.
DROP POLICY IF EXISTS player_card_own ON public.player_card;
CREATE POLICY player_card_own ON public.player_card
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS player_card_slot_own ON public.player_card_slot;
CREATE POLICY player_card_slot_own ON public.player_card_slot
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_card      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_card_slot TO authenticated;
