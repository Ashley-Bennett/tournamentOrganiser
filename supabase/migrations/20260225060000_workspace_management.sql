-- ============================================================
-- Migration: Workspace management helpers
--   1. Add timezone column to workspaces
--   2. Add slug format check constraint
--   3. Add can_manage_workspace() helper (SECURITY INVOKER)
--   4. Add create_workspace() RPC (SECURITY DEFINER, atomic)
-- ============================================================

-- ---- 1. Timezone column ------------------------------------

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/London';

-- ---- 2. Slug format constraint -----------------------------
-- Verify existing slugs conform before adding the constraint.
-- All auto-generated personal slugs (personal-xxxxxxxxxxxx)
-- already match this pattern.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) THEN
    RAISE EXCEPTION
      'Non-conforming slugs exist — fix them before applying the slug format constraint';
  END IF;
END $$;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

-- ---- 3. can_manage_workspace() (SECURITY INVOKER) ----------
-- Runs as the calling user; RLS on workspace_memberships is
-- in effect. Returns true if the caller is owner or admin.

CREATE OR REPLACE FUNCTION public.can_manage_workspace(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- ---- 4. create_workspace() RPC (SECURITY DEFINER) ----------
-- SECURITY DEFINER so it can insert into workspace_memberships
-- even though no INSERT policy exists there (preventing
-- orphan workspaces from bare client-side inserts).
-- SET search_path = public prevents search_path hijacking.

CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name     TEXT,
  p_slug     TEXT,
  p_type     TEXT,
  p_timezone TEXT DEFAULT 'Europe/London'
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace public.workspaces;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_type NOT IN ('personal', 'club', 'store') THEN
    RAISE EXCEPTION 'Invalid workspace type: %', p_type;
  END IF;

  -- Insert workspace (unique constraint on slug enforced by DB)
  INSERT INTO public.workspaces (name, slug, type, timezone, created_by)
  VALUES (p_name, p_slug, p_type, p_timezone, auth.uid())
  RETURNING * INTO v_workspace;

  -- Insert owner membership atomically in same transaction
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
  VALUES (v_workspace.id, auth.uid(), 'owner');

  RETURN v_workspace;
END;
$$;
