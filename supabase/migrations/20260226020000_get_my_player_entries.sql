-- Returns all tournament entries where the calling user is linked as a player.
-- SECURITY DEFINER so it can read tournaments and workspaces even though
-- the player is not a workspace member (no workspace RLS access).

CREATE OR REPLACE FUNCTION public.get_my_player_entries()
RETURNS TABLE(
  tournament_player_id UUID,
  tournament_id        UUID,
  tournament_name      TEXT,
  tournament_status    TEXT,
  workspace_id         UUID,
  workspace_name       TEXT,
  workspace_slug       TEXT,
  player_name          TEXT,
  joined_at            TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
    SELECT
      tp.id             AS tournament_player_id,
      t.id              AS tournament_id,
      t.name            AS tournament_name,
      t.status          AS tournament_status,
      w.id              AS workspace_id,
      w.name            AS workspace_name,
      w.slug            AS workspace_slug,
      tp.name           AS player_name,
      tp.created_at     AS joined_at
    FROM public.tournament_players tp
    JOIN public.tournaments t  ON t.id = tp.tournament_id
    JOIN public.workspaces  w  ON w.id = t.workspace_id
    WHERE tp.user_id = auth.uid()
    ORDER BY tp.created_at DESC;
END;
$$;
