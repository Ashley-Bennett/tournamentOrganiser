CREATE OR REPLACE FUNCTION public._insert_round_matches(p_tournament_id uuid, p_workspace_id uuid, p_round_number integer, p_matches jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_matches IS NULL
     OR jsonb_typeof(p_matches) <> 'array'
     OR jsonb_array_length(p_matches) = 0 THEN
    RAISE EXCEPTION 'No pairings to save';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_matches) AS m(player1_id UUID, player2_id UUID)
    WHERE m.player1_id IS NULL
       OR m.player1_id = m.player2_id
       OR NOT EXISTS (
         SELECT 1 FROM public.tournament_players tp
         WHERE tp.id = m.player1_id AND tp.tournament_id = p_tournament_id
       )
       OR (m.player2_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.tournament_players tp
         WHERE tp.id = m.player2_id AND tp.tournament_id = p_tournament_id
       ))
  ) THEN
    RAISE EXCEPTION 'Pairings include a player who is not in this tournament';
  END IF;

  INSERT INTO public.tournament_matches (
    tournament_id, workspace_id, round_number, match_number,
    player1_id, player2_id, status, pairing_decision_log
  )
  SELECT
    p_tournament_id, p_workspace_id, p_round_number, m.match_number,
    m.player1_id, m.player2_id, 'ready', m.pairing_decision_log
  FROM jsonb_to_recordset(p_matches) AS m(
    match_number         INTEGER,
    player1_id           UUID,
    player2_id           UUID,
    pairing_decision_log JSONB
  );
END;
$function$
