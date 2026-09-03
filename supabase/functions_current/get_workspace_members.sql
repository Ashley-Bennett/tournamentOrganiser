CREATE OR REPLACE FUNCTION public.get_workspace_members(p_workspace_id uuid)
 RETURNS TABLE(user_id uuid, role text, display_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
