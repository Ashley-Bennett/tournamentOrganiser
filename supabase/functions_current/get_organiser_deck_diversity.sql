CREATE OR REPLACE FUNCTION public.get_organiser_deck_diversity(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_bucket text DEFAULT 'month'::text)
 RETURNS TABLE(period_label text, period_start timestamp with time zone, events integer, decked_entries integer, distinct_decks integer, effective_decks numeric, top_deck_share numeric, top_deck1 integer, top_deck2 integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  IF p_bucket NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION 'Unsupported bucket %, expected month, quarter or year', p_bucket;
  END IF;

  RETURN QUERY
  WITH decked AS (
    SELECT
      DATE_TRUNC(p_bucket, i.played_at) AS bucket_start,
      i.tournament_id                   AS tid,
      tp.deck_pokemon1                  AS p1,
      tp.deck_pokemon2                  AS p2
    FROM public.workspace_player_identities(p_workspace_id) i
    JOIN public.tournament_players tp ON tp.id = i.tournament_player_id
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
      AND (tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL)
  ),
  per_deck AS (
    SELECT d.bucket_start, d.p1, d.p2, COUNT(*)::INT AS n
    FROM decked d
    GROUP BY d.bucket_start, d.p1, d.p2
  ),
  per_bucket AS (
    SELECT
      d.bucket_start,
      COUNT(*)::INT                  AS entries,
      COUNT(DISTINCT d.tid)::INT     AS events
    FROM decked d
    GROUP BY d.bucket_start
  ),
  shannon AS (
    SELECT
      pd.bucket_start,
      COUNT(*)::INT AS n_distinct,
      -- exp(-Î£ pÂ·ln p). A period with a single deck gives ln(1)=0, so the
      -- effective count is exactly 1 rather than undefined.
      EXP(-SUM((pd.n::FLOAT / pb.entries) * LN(pd.n::FLOAT / pb.entries))) AS effective
    FROM per_deck pd
    JOIN per_bucket pb ON pb.bucket_start = pd.bucket_start
    GROUP BY pd.bucket_start
  ),
  top_deck AS (
    SELECT DISTINCT ON (pd.bucket_start)
      pd.bucket_start, pd.p1, pd.p2, pd.n
    FROM per_deck pd
    ORDER BY pd.bucket_start, pd.n DESC, pd.p1 NULLS LAST, pd.p2 NULLS LAST
  )
  SELECT
    CASE p_bucket
      WHEN 'month'   THEN TO_CHAR(pb.bucket_start, 'Mon YY')
      WHEN 'quarter' THEN 'Q' || EXTRACT(QUARTER FROM pb.bucket_start)::TEXT
                            || ' ' || TO_CHAR(pb.bucket_start, 'YY')
      ELSE TO_CHAR(pb.bucket_start, 'YYYY')
    END,
    pb.bucket_start,
    pb.events,
    pb.entries,
    s.n_distinct,
    ROUND(s.effective::NUMERIC, 1),
    ROUND((td.n::NUMERIC / pb.entries) * 100, 0),
    td.p1,
    td.p2
  FROM per_bucket pb
  JOIN shannon  s  ON s.bucket_start  = pb.bucket_start
  JOIN top_deck td ON td.bucket_start = pb.bucket_start
  ORDER BY pb.bucket_start;
END;
$function$
