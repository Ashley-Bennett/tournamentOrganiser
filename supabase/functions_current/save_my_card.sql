CREATE OR REPLACE FUNCTION public.save_my_card(p_game_id text, p_partner_key text, p_slots jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
