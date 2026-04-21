-- ── self_claim_player_entry ──────────────────────────────────────────────────
-- Player-initiated claim: a signed-in user proves they own an anonymous entry
-- by presenting the per-tournament device_token, then links it to their account.
-- No organiser involvement required.

CREATE OR REPLACE FUNCTION public.self_claim_player_entry(
  p_tournament_player_id UUID,
  p_device_token         TEXT
)
RETURNS TABLE(tournament_id UUID, tournament_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id   UUID;
  v_tournament_id  UUID;
  v_tournament_name TEXT;
  v_player_name    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tp.workspace_id, tp.tournament_id, tp.name, t.name
  INTO v_workspace_id, v_tournament_id, v_player_name, v_tournament_name
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.id = p_tournament_player_id
    AND tp.device_token = p_device_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player entry or device token';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = p_tournament_player_id AND user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This player entry is already linked to an account';
  END IF;

  UPDATE public.tournament_players
  SET user_id = auth.uid()
  WHERE id = p_tournament_player_id;

  INSERT INTO public.workspace_players (workspace_id, user_id, preferred_name)
  VALUES (v_workspace_id, auth.uid(), v_player_name)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_tournament_id, v_tournament_name;
END;
$$;

-- ── purge_unclaimed_player_entries ───────────────────────────────────────────
-- Deletes anonymous tournament_players rows older than p_days days.
-- Intended for future use when free-tier storage limits require cleanup.
-- NOT called automatically — invoke manually or via a scheduled job when ready.

CREATE OR REPLACE FUNCTION public.purge_unclaimed_player_entries(
  p_days INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.tournament_players
  WHERE user_id IS NULL
    AND created_at < now() - (p_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
