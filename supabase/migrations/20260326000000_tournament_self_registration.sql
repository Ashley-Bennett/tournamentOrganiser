-- ── Self-registration columns ────────────────────────────────────────────────

ALTER TABLE public.tournaments
  ADD COLUMN join_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tournament_players
  ADD COLUMN device_token TEXT,   -- per-tournament auth token (self-registered players only)
  ADD COLUMN device_id    TEXT;   -- stable device identity for future account linking

-- ── get_tournament_for_join ───────────────────────────────────────────────────
-- Public read: returns tournament name/status/join_enabled for the join page.
-- No auth required — callable by anonymous users.

CREATE OR REPLACE FUNCTION public.get_tournament_for_join(
  p_tournament_id UUID
)
RETURNS TABLE(
  tournament_name TEXT,
  status          TEXT,
  join_enabled    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.name::TEXT, t.status::TEXT, t.join_enabled
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$$;

-- ── self_join_tournament ──────────────────────────────────────────────────────
-- Anonymous players self-register for a tournament.
-- Validates: tournament exists, join_enabled=true, status='draft'.
-- Case-insensitive duplicate name check.
-- Generates device_token via gen_random_uuid() — no pgcrypto needed.
-- Returns player_id and device_token for client-side caching.

CREATE OR REPLACE FUNCTION public.self_join_tournament(
  p_tournament_id UUID,
  p_player_name   TEXT,
  p_device_id     TEXT DEFAULT NULL
)
RETURNS TABLE(player_id UUID, device_token TEXT, tournament_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id    UUID;
  v_status          TEXT;
  v_join_enabled    BOOLEAN;
  v_tournament_name TEXT;
  v_player_id       UUID;
  v_device_token    TEXT;
  v_trimmed_name    TEXT;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  SELECT t.workspace_id, t.status, t.join_enabled, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT v_join_enabled THEN
    RAISE EXCEPTION 'Registration is not open for this tournament';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  -- Case-insensitive duplicate name check
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND lower(name) = lower(v_trimmed_name)
  ) THEN
    RAISE EXCEPTION 'A player with that name is already registered';
  END IF;

  -- Generate a 64-char hex token using gen_random_uuid() (no pgcrypto path issues)
  v_device_token := replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.tournament_players (
    tournament_id, workspace_id, name, device_token, device_id
  )
  VALUES (
    p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id
  )
  RETURNING id INTO v_player_id;

  RETURN QUERY SELECT v_player_id, v_device_token, v_tournament_name::TEXT;
END;
$$;
