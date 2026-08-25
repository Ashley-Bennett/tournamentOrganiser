-- ── add_known_players_to_tournament: return rows, support late entries ───────
-- Adding a workspace regular from the known-players directory sets user_id at
-- insert time, so the entry is account-linked from birth and never needs a
-- claim link. Two changes make it usable from the add-player UI:
--
--   1. Returns the inserted rows (id, name, created_at, user_id) instead of a
--      bare count. The client needs the new player's id to run the existing
--      late-entry pairing logic against it.
--   2. Accepts p_is_late_entry / p_late_entry_round so a player added to an
--      already-active tournament is flagged the same way the direct insert
--      path flags them.
--
-- The membership check stays server-side: a caller cannot attach an arbitrary
-- user_id to a tournament entry, only a user who is already a known player in
-- that workspace. Retains the COALESCE role guard from 20260825130000.
--
-- DROP first because the return type changes. No existing callers.

DROP FUNCTION IF EXISTS public.add_known_players_to_tournament(UUID, UUID[]);

CREATE FUNCTION public.add_known_players_to_tournament(
  p_tournament_id    UUID,
  p_user_ids         UUID[],
  p_is_late_entry    BOOLEAN DEFAULT FALSE,
  p_late_entry_round INTEGER DEFAULT NULL
)
RETURNS TABLE(
  player_id  UUID,
  name       TEXT,
  created_at TIMESTAMPTZ,
  user_id    UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_uid          UUID;
  v_name         TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can add known players';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    -- Validate the user really is a known player in this workspace. Without
    -- this, a manager could link a stranger's account to their tournament.
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_players wp
      WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'User % is not a known player in this workspace', v_uid;
    END IF;

    -- Resolve display name: preferred_name → profile display_name → fallback
    SELECT COALESCE(wp.preferred_name, p.display_name, 'Player')
    INTO v_name
    FROM public.workspace_players wp
    LEFT JOIN public.profiles p ON p.id = wp.user_id
    WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid;

    -- ON CONFLICT DO NOTHING against idx_tournament_players_tournament_user:
    -- a user already in this tournament is silently skipped, so re-adding is safe.
    RETURN QUERY
    INSERT INTO public.tournament_players (
      tournament_id, workspace_id, user_id, name, created_by,
      is_late_entry, late_entry_round
    )
    VALUES (
      p_tournament_id, v_workspace_id, v_uid, v_name, auth.uid(),
      COALESCE(p_is_late_entry, FALSE),
      CASE WHEN COALESCE(p_is_late_entry, FALSE) THEN p_late_entry_round ELSE NULL END
    )
    ON CONFLICT DO NOTHING
    RETURNING
      tournament_players.id,
      tournament_players.name,
      tournament_players.created_at,
      tournament_players.user_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.add_known_players_to_tournament(UUID, UUID[], BOOLEAN, INTEGER)
  TO authenticated;

-- ── list_workspace_players: expose the tournaments-played count ──────────────
-- The picker orders regulars by how often they actually turn up, which is a far
-- more useful order than "recently added" when a workspace has 40+ known players.

DROP FUNCTION IF EXISTS public.list_workspace_players(UUID);

CREATE FUNCTION public.list_workspace_players(
  p_workspace_id UUID
)
RETURNS TABLE(
  user_id            UUID,
  preferred_name     TEXT,
  display_name       TEXT,
  created_at         TIMESTAMPTZ,
  tournaments_played INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  RETURN QUERY
  SELECT
    wp.user_id,
    wp.preferred_name,
    p.display_name,
    wp.created_at,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.tournament_players tp
      WHERE tp.workspace_id = p_workspace_id
        AND tp.user_id = wp.user_id
    ) AS tournaments_played
  FROM public.workspace_players wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  WHERE wp.workspace_id = p_workspace_id
  ORDER BY tournaments_played DESC, wp.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_workspace_players(UUID) TO authenticated;
