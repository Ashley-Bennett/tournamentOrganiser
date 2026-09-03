CREATE OR REPLACE FUNCTION public.self_claim_player_entry(p_tournament_player_id uuid, p_device_token text)
 RETURNS TABLE(tournament_id uuid, tournament_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id   UUID;
  v_tournament_id  UUID;
  v_tournament_name TEXT;
  v_player_name    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tp.workspace_id, tp.tournament_id, tp.name, t.name
  INTO v_workspace_id, v_tournament_id, v_player_name, v_tournament_name
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.id = p_tournament_player_id
    AND tp.device_token = p_device_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player entry or device token';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = p_tournament_player_id AND user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This player entry is already linked to an account';
  END IF;

  UPDATE public.tournament_players
  SET user_id = auth.uid()
  WHERE id = p_tournament_player_id;

  INSERT INTO public.workspace_players (workspace_id, user_id, preferred_name)
  VALUES (v_workspace_id, auth.uid(), v_player_name)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_tournament_id, v_tournament_name;
END;
$function$
