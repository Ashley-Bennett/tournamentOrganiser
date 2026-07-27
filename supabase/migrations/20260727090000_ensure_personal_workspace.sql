-- ============================================================
-- Idempotent personal-workspace provisioning
--
-- Problem: new accounts are auto-provisioned a personal workspace
-- on first dashboard load. The client called create_workspace()
-- whenever it saw zero workspaces, which unconditionally INSERTs.
-- Any remount / StrictMode double-invoke / second tab / in-flight
-- race therefore created a SECOND personal workspace for the same
-- user (observed: duplicate "X's workspace" rows).
--
-- Fix: a single idempotent RPC that returns the caller's existing
-- personal workspace if one exists, and only creates one otherwise.
-- Concurrency is serialized per-user with a transaction-scoped
-- advisory lock so two simultaneous calls can't both pass the
-- existence check and both insert. Slug collisions are resolved
-- internally, so the client no longer needs a retry loop.
--
-- This does NOT add a hard unique constraint, so it is safe to
-- apply on top of databases that already contain duplicate
-- personal workspaces — it only prevents NEW duplicates.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_personal_workspace(
  p_name     TEXT,
  p_slug     TEXT,
  p_timezone TEXT DEFAULT 'Europe/London'
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_workspace public.workspaces;
  v_slug      TEXT := p_slug;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialize concurrent provisioning for this user. The lock is
  -- released automatically at transaction end. Two in-flight calls
  -- for the same user run one-at-a-time, so the second sees the
  -- workspace the first created instead of inserting its own.
  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  -- Already have a personal workspace? Return the earliest one so
  -- the result is stable across calls.
  SELECT w.* INTO v_workspace
  FROM public.workspaces w
  WHERE w.type = 'personal'
    AND w.created_by = v_uid
  ORDER BY w.created_at ASC, w.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_workspace;
  END IF;

  -- None yet — create one, resolving slug collisions on the fly.
  LOOP
    BEGIN
      INSERT INTO public.workspaces (name, slug, type, timezone, created_by)
      VALUES (p_name, v_slug, 'personal', p_timezone, v_uid)
      RETURNING * INTO v_workspace;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_slug := p_slug || '-' || substr(md5(random()::text), 1, 6);
    END;
  END LOOP;

  -- Owner membership, atomic with the workspace insert.
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
  VALUES (v_workspace.id, v_uid, 'owner');

  RETURN v_workspace;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_personal_workspace(TEXT, TEXT, TEXT)
  TO authenticated;
