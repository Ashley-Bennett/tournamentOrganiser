-- ============================================================
-- Migration: Add workspaces and workspace_memberships tables
-- ============================================================

-- Tenancy root: a workspace is the tenant boundary
CREATE TABLE public.workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  type        TEXT        NOT NULL DEFAULT 'personal'
                CHECK (type IN ('personal', 'club', 'store')),
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who can access a workspace
CREATE TABLE public.workspace_memberships (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'owner'
                 CHECK (role IN ('owner', 'admin', 'judge', 'staff')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- ============================================================
-- Helper functions (SECURITY DEFINER so RLS can call them
-- without infinite recursion)
-- ============================================================

-- Returns TRUE if the current authenticated user is a member of the workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  );
$$;

-- Returns the current user's role in the workspace (NULL if not a member)
CREATE OR REPLACE FUNCTION public.get_workspace_role(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role
  FROM public.workspace_memberships
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- ============================================================
-- Trigger: auto-create personal workspace when a user signs up
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id UUID := gen_random_uuid();
  v_workspace_slug TEXT;
BEGIN
  -- Build a slug like "personal-a1b2c3d4e5f6"
  v_workspace_slug := 'personal-' || substr(replace(NEW.id::text, '-', ''), 1, 12);

  INSERT INTO public.workspaces (id, name, slug, type, created_by)
  VALUES (
    v_workspace_id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'My Workspace'),
    v_workspace_slug,
    'personal',
    NEW.id
  );

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace();

-- ============================================================
-- Row-Level Security for the new tables
-- ============================================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Members can read their own workspaces
CREATE POLICY "workspaces_select_member"
  ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id));

-- Only owner/admin can update workspace metadata
CREATE POLICY "workspaces_update_owner"
  ON public.workspaces FOR UPDATE
  USING (public.get_workspace_role(id) IN ('owner', 'admin'));

ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

-- Members can see the membership list for their workspace
CREATE POLICY "memberships_select_member"
  ON public.workspace_memberships FOR SELECT
  USING (public.is_workspace_member(workspace_id));
