CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
