-- ============================================================
-- High-severity audit fixes (2026-07-19)
--
-- #3 tournament_matches_select_anon leaked every match row of
--    every tournament to anonymous callers (any pending/completed
--    match, cross-tenant). Scope it to tournaments that actually
--    have self-registration (join_code IS NOT NULL) — the only
--    reason anon needs match access. Public tournaments remain
--    covered by the separate tournament_matches_select_public
--    policy. join_code is used (not join_enabled) so device
--    players keep receiving realtime updates after the organiser
--    closes registration mid-event.
--
-- #4 match_result_reports had a SELECT policy of USING (true) for
--    every authenticated user — a cross-tenant read of all pending
--    player reports. Scope it to workspace members of the match's
--    tournament. Player-facing data still flows only through the
--    get_match_result_reports / get_player_tournament_view RPCs;
--    the organiser's realtime subscription still receives events.
--
-- #6 accept_workspace_invite never checked that the caller's email
--    matched the invite, so a forwarded link granted admin to
--    anyone signed in. Verify auth.users.email == invite email.
--
-- #7 set_tournament_join_enabled referenced a non-existent table
--    (workspace_members) and role ('manager'), so any owner/admin
--    who was not the tournament creator hit a hard SQL error.
--    Rewrite the auth check against workspace role.
-- ============================================================

-- ---- #3 ----------------------------------------------------
DROP POLICY IF EXISTS "tournament_matches_select_anon" ON public.tournament_matches;

CREATE POLICY "tournament_matches_select_anon"
  ON public.tournament_matches
  FOR SELECT
  TO anon
  USING (
    (pairings_published = true OR status IN ('pending', 'completed', 'bye'))
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND t.join_code IS NOT NULL
    )
  );

-- ---- #4 ----------------------------------------------------
DROP POLICY IF EXISTS "authenticated users can select match reports"
  ON public.match_result_reports;

CREATE POLICY "match_reports_select_member"
  ON public.match_result_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournament_matches m
      JOIN public.tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_result_reports.match_id
        AND public.is_workspace_member(t.workspace_id)
    )
  );

-- ---- #6 ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_token TEXT)
RETURNS UUID  -- returns workspace_id for redirect
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite       public.workspace_invites;
  v_caller_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite
    FROM public.workspace_invites
    WHERE token = p_token
      AND status = 'pending'
      AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or expired';
  END IF;

  -- The invite is bound to a specific email address. Reject callers
  -- whose account email does not match (prevents forwarded-link abuse).
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL OR lower(v_caller_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invite was issued to a different email address';
  END IF;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
    VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites
    SET status = 'accepted'
    WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

-- ---- #7 ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_tournament_join_enabled(
  p_tournament_id UUID,
  p_enabled       BOOLEAN
)
RETURNS TABLE (join_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id  UUID;
  v_existing_code TEXT;
  v_new_code      TEXT;
BEGIN
  SELECT t.workspace_id, t.join_code
    INTO v_workspace_id, v_existing_code
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- Only workspace owner/admin may toggle self-registration.
  IF public.get_workspace_role(v_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;

  IF p_enabled THEN
    IF v_existing_code IS NULL THEN
      v_new_code := generate_join_code();
    ELSE
      v_new_code := v_existing_code;
    END IF;

    UPDATE public.tournaments
    SET join_enabled = TRUE, join_code = v_new_code
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_new_code;
  ELSE
    UPDATE public.tournaments
    SET join_enabled = FALSE
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_existing_code;
  END IF;
END;
$$;
