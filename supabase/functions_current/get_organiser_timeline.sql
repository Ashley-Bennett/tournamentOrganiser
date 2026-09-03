CREATE OR REPLACE FUNCTION public.get_organiser_timeline(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_bucket text DEFAULT 'month'::text)
 RETURNS TABLE(period_label text, period_start timestamp with time zone, events integer, entries integer, unique_players integer, new_players integer, avg_field_size numeric)
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
  WITH all_entries AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
  ),
  first_seen AS (
    SELECT ae.identity_key AS ikey, MIN(ae.played_at) AS first_played
    FROM all_entries ae
    GROUP BY ae.identity_key
  ),
  bucketed AS (
    SELECT
      DATE_TRUNC(p_bucket, ae.played_at) AS bucket_start,
      ae.identity_key                    AS ikey,
      ae.tournament_id                   AS tid,
      ae.tournament_player_id            AS tpid,
      fs.first_played
    FROM all_entries ae
    JOIN first_seen fs ON fs.ikey = ae.identity_key
    WHERE (p_from IS NULL OR ae.played_at >= p_from)
      AND (p_to   IS NULL OR ae.played_at <  p_to)
  )
  SELECT
    CASE p_bucket
      WHEN 'month'   THEN TO_CHAR(b.bucket_start, 'Mon YY')
      WHEN 'quarter' THEN 'Q' || EXTRACT(QUARTER FROM b.bucket_start)::TEXT
                            || ' ' || TO_CHAR(b.bucket_start, 'YY')
      ELSE TO_CHAR(b.bucket_start, 'YYYY')
    END,
    b.bucket_start,
    COUNT(DISTINCT b.tid)::INT,
    COUNT(b.tpid)::INT,
    COUNT(DISTINCT b.ikey)::INT,
    COUNT(DISTINCT b.ikey) FILTER (
      WHERE DATE_TRUNC(p_bucket, b.first_played) = b.bucket_start
    )::INT,
    ROUND(
      COUNT(b.tpid)::NUMERIC / NULLIF(COUNT(DISTINCT b.tid), 0),
      1
    )
  FROM bucketed b
  GROUP BY b.bucket_start
  ORDER BY b.bucket_start;
END;
$function$
