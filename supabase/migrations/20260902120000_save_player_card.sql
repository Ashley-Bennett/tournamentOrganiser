-- ============================================================
-- Saving a player card in one go (2026-09-02)
--
-- NOT YET ENABLED. Nothing calls this.
--
-- A card is four choices — a partner and three slots plus a title — and
-- the client could write them with four upserts and a delete. It should
-- not: dropping the connection halfway leaves somebody wearing half a
-- card, and the failure is invisible until they are on a projector.
--
-- This replaces the whole loadout for one game as a single statement.
-- Either all of it lands or none of it does.
--
-- Validity is still the client's job — whether a badge exists, and
-- whether it has been earned, are decided by the frontend registry and
-- the saved badge rows. The one thing checked here is that the caller
-- owns what they are writing, because that is the part a browser must
-- never be trusted with.
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_my_card(
  p_game_id     TEXT,
  p_partner_key TEXT,
  -- [{ "slot": 0, "badgeId": "attendance", "workspaceId": "..." }, ...]
  -- An empty array clears every slot, which is how a player takes
  -- everything off.
  p_slots       JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_game_id IS NULL OR BTRIM(p_game_id) = '' THEN
    RAISE EXCEPTION 'A card belongs to a game';
  END IF;

  IF JSONB_TYPEOF(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'Slots must be an array';
  END IF;

  INSERT INTO public.player_card (user_id, game_id, partner_key, updated_at)
  VALUES (v_uid, p_game_id, p_partner_key, NOW())
  ON CONFLICT (user_id, game_id) DO UPDATE
    SET partner_key = EXCLUDED.partner_key,
        updated_at  = NOW();

  -- Replace rather than merge: a slot the player has cleared must go, and
  -- working out which ones those are is exactly the bookkeeping that goes
  -- wrong when a client does it.
  DELETE FROM public.player_card_slot
  WHERE user_id = v_uid AND game_id = p_game_id;

  INSERT INTO public.player_card_slot
    (user_id, game_id, slot, badge_id, workspace_id, updated_at)
  SELECT
    v_uid,
    p_game_id,
    (s->>'slot')::SMALLINT,
    s->>'badgeId',
    NULLIF(s->>'workspaceId', '')::UUID,
    NOW()
  FROM JSONB_ARRAY_ELEMENTS(p_slots) s
  WHERE s->>'badgeId' IS NOT NULL
    AND (s->>'slot') ~ '^[0-9]+$'
    AND (s->>'slot')::SMALLINT BETWEEN 0 AND 3;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_my_card(TEXT, TEXT, JSONB) TO authenticated;
