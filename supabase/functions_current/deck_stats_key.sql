CREATE OR REPLACE FUNCTION public.deck_stats_key(p1 integer, p2 integer, p_stack boolean)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN NOT COALESCE(p_stack, FALSE) OR x.k IS NULL OR cardinality(x.k) < 2 THEN x.k
    ELSE COALESCE((
      SELECT ARRAY[a.pid]
      FROM unnest(x.k) AS a(pid)
      CROSS JOIN LATERAL (SELECT public.deck_solo_count(a.pid) AS n) s
      WHERE s.n > 0
      ORDER BY s.n DESC, a.pid
      LIMIT 1
    ), x.k)
  END
  FROM (SELECT public.deck_norm(p1, p2) AS k) x
$function$
