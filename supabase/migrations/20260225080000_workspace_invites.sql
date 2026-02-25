-- Workspace invites: invite users to a workspace by email using a token link.

-- 1. pgcrypto for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. workspace_invites table
CREATE TABLE public.workspace_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  invited_by   UUID        NOT NULL REFERENCES auth.users(id),
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);

-- Unique pending invite per workspace+email (allow re-invite after revoke/accept)
CREATE UNIQUE INDEX workspace_invites_pending_email
  ON public.workspace_invites (workspace_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX workspace_invites_token_idx ON public.workspace_invites (token);

-- 3. RLS on workspace_invites
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Only workspace managers (owner/admin) can read invites — tokens must not leak to plain members
CREATE POLICY "invites_select_manager" ON public.workspace_invites FOR SELECT
  USING (public.can_manage_workspace(workspace_id));

-- Only managers can create invites (role-rank check enforced inside RPC)
CREATE POLICY "invites_insert_manager" ON public.workspace_invites FOR INSERT
  WITH CHECK (public.can_manage_workspace(workspace_id));

-- Only managers can update (revoke)
CREATE POLICY "invites_update_manager" ON public.workspace_invites FOR UPDATE
  USING (public.can_manage_workspace(workspace_id));

-- 4. Role rank helper (IMMUTABLE so it can be inlined)
CREATE OR REPLACE FUNCTION public.get_role_rank(p_role TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'judge' THEN 2
    WHEN 'staff' THEN 1
    ELSE 0
  END;
$$;

-- 5. get_workspace_members — returns member list with profile display names
-- All workspace members can call this; profiles are joined via SECURITY DEFINER to bypass
-- the profiles RLS that only allows users to read their own profile.
CREATE OR REPLACE FUNCTION public.get_workspace_members(p_workspace_id UUID)
RETURNS TABLE(user_id UUID, role TEXT, display_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
    SELECT m.user_id, m.role, p.display_name, m.created_at
    FROM public.workspace_memberships m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = p_workspace_id
    ORDER BY m.created_at;
END;
$$;

-- 6. create_workspace_invite — only owner can invite admins (MVP: only admin role)
CREATE OR REPLACE FUNCTION public.create_workspace_invite(
  p_workspace_id UUID,
  p_email        TEXT,
  p_role         TEXT DEFAULT 'admin'
)
RETURNS public.workspace_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role TEXT;
  v_invite      public.workspace_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite as owner';
  END IF;

  v_caller_role := public.get_workspace_role(p_workspace_id);

  IF public.get_role_rank(v_caller_role) <= public.get_role_rank(p_role) THEN
    RAISE EXCEPTION 'Insufficient permissions to invite role %', p_role;
  END IF;

  -- Revoke any existing pending invite for this workspace+email before creating a fresh one
  UPDATE public.workspace_invites
    SET status = 'revoked'
    WHERE workspace_id = p_workspace_id
      AND lower(email) = lower(p_email)
      AND status = 'pending';

  INSERT INTO public.workspace_invites (workspace_id, email, role, invited_by)
    VALUES (p_workspace_id, lower(p_email), p_role, auth.uid())
    RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

-- 7. accept_workspace_invite — accepts a token and creates a membership
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_token TEXT)
RETURNS UUID  -- returns workspace_id for redirect
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.workspace_invites;
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

  -- Insert membership; if already a member, do nothing
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
    VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites
    SET status = 'accepted'
    WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

-- 8. revoke_workspace_invite
CREATE OR REPLACE FUNCTION public.revoke_workspace_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM public.workspace_invites
    WHERE id = p_invite_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF NOT public.can_manage_workspace(v_workspace_id) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE public.workspace_invites SET status = 'revoked' WHERE id = p_invite_id;
END;
$$;

-- 9. remove_workspace_member
CREATE OR REPLACE FUNCTION public.remove_workspace_member(
  p_workspace_id UUID,
  p_user_id      UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  v_caller_role := public.get_workspace_role(p_workspace_id);

  SELECT role INTO v_target_role
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member';
  END IF;

  -- Explicitly block removing the workspace owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove workspace owner';
  END IF;

  -- Caller must outrank target
  IF public.get_role_rank(v_caller_role) <= public.get_role_rank(v_target_role) THEN
    RAISE EXCEPTION 'Insufficient permissions to remove this member';
  END IF;

  DELETE FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
END;
$$;
