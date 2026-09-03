CREATE OR REPLACE FUNCTION public._find_possible_duplicate_entry(p_tournament_id uuid, p_name text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm   TEXT;
  v_first  TEXT;
  v_tokens TEXT[];
  v_match  TEXT;
BEGIN
  v_norm := public._normalise_player_name(p_name);
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  v_first := split_part(v_norm, ' ', 1);

  SELECT array_agg(tok) INTO v_tokens
  FROM unnest(string_to_array(v_norm, ' ')) AS tok
  WHERE length(tok) >= 3 AND tok <> v_first;

  SELECT scored.name INTO v_match
  FROM (
    SELECT
      c.name,
      CASE
        WHEN c.norm = v_norm THEN 3.0
        WHEN split_part(c.norm, ' ', 1) = v_first THEN 2.0
        WHEN v_tokens IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(string_to_array(c.norm, ' ')) AS t
          WHERE t = ANY (v_tokens)
        ) THEN 1.5
        WHEN length(v_first) >= 3
         AND length(split_part(c.norm, ' ', 1)) >= 3
         AND left(split_part(c.norm, ' ', 1), 3) = left(v_first, 3) THEN 1.2
        ELSE extensions.similarity(split_part(c.norm, ' ', 1), v_first)
      END AS score
    FROM (
      SELECT tp.name, public._normalise_player_name(tp.name) AS norm
      FROM public.tournament_players tp
      WHERE tp.tournament_id = p_tournament_id
        AND tp.created_by IS NOT NULL
    ) c
  ) scored
  WHERE scored.score >= 0.4
  ORDER BY scored.score DESC, scored.name
  LIMIT 1;

  RETURN v_match;
END;
$function$
