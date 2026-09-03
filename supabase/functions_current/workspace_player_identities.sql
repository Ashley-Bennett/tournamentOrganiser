CREATE OR REPLACE FUNCTION public.workspace_player_identities(p_workspace_id uuid)
 RETURNS TABLE(tournament_player_id uuid, tournament_id uuid, identity_key text, display_name text, is_linked boolean, played_at timestamp with time zone, game_id text, dropped boolean, is_late_entry boolean)
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
  WITH entries AS (
    SELECT
      tp.id,
      tp.tournament_id,
      tp.user_id,
      tp.name,
      LOWER(BTRIM(tp.name))               AS norm_name,
      COALESCE(t.starts_at, t.created_at) AS played_at,
      t.game_id,
      tp.dropped,
      tp.is_late_entry
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE t.workspace_id = p_workspace_id
      AND t.status <> 'draft'
  ),
  name_to_user AS (
    SELECT
      e.norm_name,
      (ARRAY_AGG(DISTINCT e.user_id))[1] AS user_id
    FROM entries e
    WHERE e.user_id IS NOT NULL
    GROUP BY e.norm_name
    HAVING COUNT(DISTINCT e.user_id) = 1
  ),
  keyed AS (
    SELECT
      e.*,
      COALESCE(
        l.canonical_key,
        e.user_id::TEXT,
        ntu.user_id::TEXT,
        'name:' || e.norm_name
      ) AS resolved_key
    FROM entries e
    LEFT JOIN name_to_user ntu ON ntu.norm_name = e.norm_name
    LEFT JOIN public.workspace_player_links l ON l.tournament_player_id = e.id
  ),
  labelled AS (
    SELECT
      k.*,
      FIRST_VALUE(k.name) OVER (
        PARTITION BY k.resolved_key
        -- An entry whose own name IS the identity's name wins. Otherwise
        -- merging "Dave S" and "Dve" into "Dave" would show the person as
        -- whichever variant they entered most recently â€” quite possibly the
        -- typo the organiser just merged away. Failing that, most recent
        -- wins, so someone correcting their own spelling still updates.
        ORDER BY
          CASE WHEN 'name:' || k.norm_name = k.resolved_key THEN 0 ELSE 1 END,
          k.played_at DESC,
          k.id DESC
      ) AS resolved_display_name
    FROM keyed k
  )
  SELECT
    l.id,
    l.tournament_id,
    l.resolved_key,
    l.resolved_display_name,
    -- A key that is neither a name nor a manual id is an account UUID.
    l.resolved_key NOT LIKE 'name:%' AND l.resolved_key NOT LIKE 'manual:%',
    l.played_at,
    l.game_id,
    l.dropped,
    l.is_late_entry
  FROM labelled l;
END;
$function$
