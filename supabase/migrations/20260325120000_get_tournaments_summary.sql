-- ── get_tournaments_summary ───────────────────────────────────────────────────
-- Public batch lookup: returns name, workspace, and status for a set of
-- tournament IDs. Used by the device "My Tournaments" page — no auth required.

CREATE OR REPLACE FUNCTION public.get_tournaments_summary(
  p_tournament_ids UUID[]
)
RETURNS TABLE(
  tournament_id   UUID,
  tournament_name TEXT,
  workspace_name  TEXT,
  status          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id            AS tournament_id,
    t.name::TEXT    AS tournament_name,
    w.name::TEXT    AS workspace_name,
    t.status::TEXT  AS status
  FROM public.tournaments t
  JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE t.id = ANY(p_tournament_ids);
END;
$$;
