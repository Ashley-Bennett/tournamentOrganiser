CREATE OR REPLACE FUNCTION public.ensure_personal_workspace(p_name text, p_slug text, p_timezone text DEFAULT 'Europe/London'::text)
 RETURNS workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
