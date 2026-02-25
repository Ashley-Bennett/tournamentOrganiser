-- Partial unique index: one linked user per tournament (prevents duplicates when adding known players)
CREATE UNIQUE INDEX idx_tournament_players_tournament_user
  ON public.tournament_players(tournament_id, user_id)
  WHERE user_id IS NOT NULL;

-- ── tournament_player_claims ──────────────────────────────────────────────────
-- Stores short-lived tokens that let a player claim their tournament entry.

CREATE TABLE public.tournament_player_claims (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_player_id UUID        NOT NULL REFERENCES public.tournament_players(id) ON DELETE CASCADE,
  workspace_id         UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token                TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by           UUID        NOT NULL REFERENCES auth.users(id),
  status               TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);

CREATE INDEX idx_player_claims_token     ON public.tournament_player_claims(token);
CREATE INDEX idx_player_claims_ws_status ON public.tournament_player_claims(workspace_id, status);

ALTER TABLE public.tournament_player_claims ENABLE ROW LEVEL SECURITY;

-- Only owner/admin can see claim tokens (tokens must not leak to plain members)
CREATE POLICY "player_claims_select_manager"
  ON public.tournament_player_claims FOR SELECT
  USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));

CREATE POLICY "player_claims_update_manager"
  ON public.tournament_player_claims FOR UPDATE
  USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));

-- No INSERT policy — all inserts go through create_player_claim_link (SECURITY DEFINER).
-- Direct client inserts are intentionally blocked.

-- ── B1: create_player_claim_link ─────────────────────────────────────────────
-- Generates (or replaces) a pending claim token for a tournament player entry.
-- Caller must be workspace owner or admin.

CREATE OR REPLACE FUNCTION public.create_player_claim_link(
  p_tournament_player_id UUID
)
RETURNS TABLE(token TEXT, claim_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_token        TEXT;
  v_claim_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournament_players
  WHERE id = p_tournament_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF public.get_workspace_role(v_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can create claim links';
  END IF;

  -- Revoke any existing pending claim for this player
  UPDATE public.tournament_player_claims
  SET status = 'revoked'
  WHERE tournament_player_id = p_tournament_player_id
    AND status = 'pending';

  -- Let the column DEFAULT (encode(gen_random_bytes(32), 'hex')) generate the token.
  -- Avoids calling gen_random_bytes() directly inside a restricted search_path;
  -- DEFAULT expressions resolve against the extension schema correctly.
  INSERT INTO public.tournament_player_claims (tournament_player_id, workspace_id, created_by)
  VALUES (p_tournament_player_id, v_workspace_id, auth.uid())
  RETURNING id, tournament_player_claims.token INTO v_claim_id, v_token;

  RETURN QUERY SELECT v_token, v_claim_id;
END;
$$;

-- ── B2: accept_player_claim_link ─────────────────────────────────────────────
-- Logged-in player claims their tournament entry via token.
-- Links tournament_players.user_id, upserts workspace_players, marks claim accepted.

CREATE OR REPLACE FUNCTION public.accept_player_claim_link(
  p_token TEXT
)
RETURNS TABLE(workspace_id UUID, workspace_slug TEXT, tournament_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim        public.tournament_player_claims%ROWTYPE;
  v_tournament_id UUID;
  v_slug         TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_claim
  FROM public.tournament_player_claims
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already used claim link';
  END IF;

  -- Reject if already linked
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = v_claim.tournament_player_id
      AND user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This player entry is already linked to an account';
  END IF;

  -- Link the player entry to the claiming user
  UPDATE public.tournament_players
  SET user_id = auth.uid()
  WHERE id = v_claim.tournament_player_id;

  -- Add to workspace known-players directory.
  -- ON CONFLICT DO NOTHING (no column list) avoids ambiguity between the
  -- output parameter also named workspace_id and the table column.
  INSERT INTO public.workspace_players (workspace_id, user_id)
  VALUES (v_claim.workspace_id, auth.uid())
  ON CONFLICT DO NOTHING;

  -- Mark claim accepted
  UPDATE public.tournament_player_claims
  SET status = 'accepted'
  WHERE id = v_claim.id;

  -- Gather return values
  SELECT tp.tournament_id, w.slug
  INTO v_tournament_id, v_slug
  FROM public.tournament_players tp
  JOIN public.workspaces w ON w.id = v_claim.workspace_id
  WHERE tp.id = v_claim.tournament_player_id;

  RETURN QUERY SELECT v_claim.workspace_id, v_slug, v_tournament_id;
END;
$$;

-- ── B3: list_workspace_players ───────────────────────────────────────────────
-- Returns known players for a workspace (for the "Add from Known Players" picker).
-- SECURITY INVOKER: caller's RLS applies; workspace_players SELECT policy gates access.

CREATE OR REPLACE FUNCTION public.list_workspace_players(
  p_workspace_id UUID
)
RETURNS TABLE(
  user_id        UUID,
  preferred_name TEXT,
  display_name   TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  RETURN QUERY
  SELECT
    wp.user_id,
    wp.preferred_name,
    p.display_name,
    wp.created_at
  FROM public.workspace_players wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  WHERE wp.workspace_id = p_workspace_id
  ORDER BY wp.created_at DESC;
END;
$$;

-- ── B4: add_known_players_to_tournament ──────────────────────────────────────
-- Bulk-adds workspace known-players to a tournament (already linked, no re-claim needed).

CREATE OR REPLACE FUNCTION public.add_known_players_to_tournament(
  p_tournament_id UUID,
  p_user_ids      UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_uid          UUID;
  v_name         TEXT;
  v_inserted     INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF public.get_workspace_role(v_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can add known players';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    -- Validate user is a known player in this workspace
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_players
      WHERE workspace_id = v_workspace_id AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'User % is not a known player in this workspace', v_uid;
    END IF;

    -- Resolve display name: preferred_name → profile display_name → fallback
    SELECT COALESCE(wp.preferred_name, p.display_name, 'Player')
    INTO v_name
    FROM public.workspace_players wp
    LEFT JOIN public.profiles p ON p.id = wp.user_id
    WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid;

    INSERT INTO public.tournament_players (tournament_id, workspace_id, user_id, name, created_by)
    VALUES (p_tournament_id, v_workspace_id, v_uid, v_name, auth.uid())
    ON CONFLICT DO NOTHING;

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ── B5: revoke_player_claim_link ─────────────────────────────────────────────
-- Owner/admin can revoke a pending claim link before it is used.

CREATE OR REPLACE FUNCTION public.revoke_player_claim_link(
  p_claim_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournament_player_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF public.get_workspace_role(v_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can revoke claim links';
  END IF;

  UPDATE public.tournament_player_claims
  SET status = 'revoked'
  WHERE id = p_claim_id AND status = 'pending';
END;
$$;
