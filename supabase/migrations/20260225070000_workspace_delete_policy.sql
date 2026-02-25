-- ============================================================
-- Migration: Allow workspace owners to delete their workspace
--
-- Deletion cascades to all child data (tournaments, players,
-- matches, standings, memberships) via ON DELETE CASCADE FKs.
-- Only the workspace owner may delete — not admins.
-- ============================================================

CREATE POLICY "workspaces_delete_owner"
  ON public.workspaces FOR DELETE
  USING (public.get_workspace_role(id) = 'owner');
