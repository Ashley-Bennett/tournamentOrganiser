CREATE OR REPLACE FUNCTION public.save_tournament_standings(p_tournament_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ws UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_ws FROM public.tournaments WHERE id = p_tournament_id;
  IF v_ws IS NULL OR NOT public.can_manage_workspace(v_ws) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  DELETE FROM public.tournament_standings WHERE tournament_id = p_tournament_id;

  INSERT INTO public.tournament_standings
    (tournament_id, workspace_id, player_id, position,
     match_points, wins, losses, draws, matches_played, byes_received)
  SELECT
    p_tournament_id, v_ws,
    (r->>'player_id')::UUID,
    (r->>'position')::INT,
    COALESCE((r->>'match_points')::INT, 0),
    COALESCE((r->>'wins')::INT, 0),
    COALESCE((r->>'losses')::INT, 0),
    COALESCE((r->>'draws')::INT, 0),
    COALESCE((r->>'matches_played')::INT, 0),
    COALESCE((r->>'byes_received')::INT, 0)
  FROM jsonb_array_elements(p_rows) AS r;
END;
$function$
