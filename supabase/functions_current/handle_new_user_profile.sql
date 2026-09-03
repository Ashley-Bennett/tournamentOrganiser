CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Personal workspace was just created by the workspace trigger
  SELECT id INTO v_workspace_id
  FROM public.workspaces
  WHERE created_by = NEW.id AND type = 'personal'
  LIMIT 1;

  INSERT INTO public.profiles (id, display_name, default_workspace_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    v_workspace_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$
