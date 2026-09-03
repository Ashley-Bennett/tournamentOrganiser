CREATE OR REPLACE FUNCTION public.create_workspace(p_name text, p_slug text, p_type text, p_timezone text DEFAULT 'Europe/London'::text)
 RETURNS workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
