-- ============================================================
-- Self-serve account deletion (GDPR right to erasure)
--
-- delete_account() removes the calling user and everything only
-- they own, while preserving shared-workspace data owned jointly
-- with others:
--
--   1. Workspaces where the caller is the sole owner are deleted
--      outright (cascades to tournaments, players, matches,
--      standings, invites, memberships, claims).
--   2. In workspaces that survive (another owner exists), the
--      caller's tournaments and player rows are reassigned to
--      another manager. Without this, the ON DELETE CASCADE on
--      tournaments.created_by / tournament_players.created_by
--      would destroy other people's events when the auth user row
--      is deleted.
--   3. Rows referencing auth.users with no ON DELETE action
--      (workspace_invites.invited_by, tournament_player_claims
--      .created_by) are removed so the auth.users delete can't be
--      blocked by an FK violation.
--   4. auth.users row is deleted; remaining FKs cascade
--      (profiles, memberships, workspace_players, match_insights,
--      legacy tournaments with no workspace).
--   5. audit_log rows for the user are deleted LAST: the audit
--      triggers on tournaments/players/matches fire during the
--      cascaded deletes above and write fresh rows with this
--      user's id, so an early purge would leave new entries
--      behind.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Delete workspaces where the caller is the only owner
  DELETE FROM public.workspaces w
  WHERE EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = w.id
        AND m.user_id = v_uid
        AND m.role = 'owner'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = w.id
        AND m.user_id <> v_uid
        AND m.role = 'owner'
    );

  -- 2a. Reassign the caller's tournaments in surviving shared workspaces
  UPDATE public.tournaments t
  SET created_by = sub.new_owner
  FROM (
    SELECT t2.id AS tournament_id,
           (SELECT m.user_id
              FROM public.workspace_memberships m
             WHERE m.workspace_id = t2.workspace_id
               AND m.user_id <> v_uid
             ORDER BY CASE m.role
                        WHEN 'owner' THEN 0
                        WHEN 'admin' THEN 1
                        ELSE 2
                      END,
                      m.created_at
             LIMIT 1) AS new_owner
    FROM public.tournaments t2
    WHERE t2.created_by = v_uid
      AND t2.workspace_id IS NOT NULL
  ) sub
  WHERE t.id = sub.tournament_id
    AND sub.new_owner IS NOT NULL;

  -- 2b. Reassign player rows the caller created in tournaments that now
  --     belong to someone else (keeps other organisers' pairings intact)
  UPDATE public.tournament_players tp
  SET created_by = t.created_by
  FROM public.tournaments t
  WHERE tp.tournament_id = t.id
    AND tp.created_by = v_uid
    AND t.created_by <> v_uid;

  -- 3. Rows that would block the auth.users delete (no ON DELETE action),
  --    plus invites addressed to the caller's email (their personal data)
  DELETE FROM public.workspace_invites WHERE invited_by = v_uid;
  DELETE FROM public.workspace_invites
  WHERE lower(email) = (SELECT lower(email) FROM auth.users WHERE id = v_uid);
  DELETE FROM public.tournament_player_claims WHERE created_by = v_uid;

  -- 4. Delete the auth user; remaining references cascade or null out
  DELETE FROM auth.users WHERE id = v_uid;

  -- 5. Purge audit entries, including ones just written by the cascades
  DELETE FROM public.audit_log WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;
