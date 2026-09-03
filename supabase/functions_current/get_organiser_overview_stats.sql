CREATE OR REPLACE FUNCTION public.get_organiser_overview_stats(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(events_total integer, events_completed integer, unique_players integer, linked_players integer, new_players integer, returning_players integer, total_entries integer, total_matches integer, avg_field_size numeric, largest_event_name text, largest_event_size integer, dropped_entries integer, late_entries integer)
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
  in_range AS (
    SELECT ae.*
    FROM all_entries ae
    WHERE (p_from IS NULL OR ae.played_at >= p_from)
      AND (p_to   IS NULL OR ae.played_at <  p_to)
  ),
  events AS (
    SELECT
      t.id                                AS event_id,
      t.name                              AS event_name,
      t.status                            AS event_status,
      COUNT(ir.tournament_player_id)::INT AS field_size
    FROM public.tournaments t
    JOIN in_range ir ON ir.tournament_id = t.id
    GROUP BY t.id, t.name, t.status
  ),
  match_count AS (
    SELECT COUNT(*)::INT AS n
    FROM public.tournament_matches tm
    WHERE tm.tournament_id IN (SELECT e.event_id FROM events e)
      AND tm.status IN ('completed', 'bye')
  ),
  largest AS (
    SELECT e.event_name, e.field_size
    FROM events e
    ORDER BY e.field_size DESC, e.event_name
    LIMIT 1
  ),
  people AS (
    SELECT
      COUNT(DISTINCT ir.identity_key)::INT AS uniq,
      COUNT(DISTINCT ir.identity_key) FILTER (WHERE ir.is_linked)::INT AS linked,
      COUNT(DISTINCT ir.identity_key) FILTER (
        WHERE fs.first_played >= COALESCE(p_from, '-infinity'::TIMESTAMPTZ)
      )::INT AS newbies
    FROM in_range ir
    JOIN first_seen fs ON fs.ikey = ir.identity_key
  )
  SELECT
    (SELECT COUNT(*)::INT FROM events),
    (SELECT COUNT(*)::INT FROM events e WHERE e.event_status = 'completed'),
    p.uniq,
    p.linked,
    p.newbies,
    (p.uniq - p.newbies)::INT,
    (SELECT COUNT(*)::INT FROM in_range),
    (SELECT mc.n FROM match_count mc),
    (SELECT ROUND(AVG(e.field_size), 1) FROM events e),
    (SELECT l.event_name FROM largest l),
    (SELECT l.field_size FROM largest l),
    (SELECT COUNT(*)::INT FROM in_range ir WHERE ir.dropped),
    (SELECT COUNT(*)::INT FROM in_range ir WHERE ir.is_late_entry)
  FROM people p;
END;
$function$
