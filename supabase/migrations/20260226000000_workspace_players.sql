-- Known players directory for a workspace.
-- Populated automatically when a player claims a tournament entry via accept_player_claim_link().

CREATE TABLE public.workspace_players (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_name TEXT        NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_players_workspace ON public.workspace_players(workspace_id);
CREATE INDEX idx_workspace_players_user      ON public.workspace_players(user_id);

ALTER TABLE public.workspace_players ENABLE ROW LEVEL SECURITY;

-- Workspace members can read (for the "Add from Known Players" picker)
CREATE POLICY "workspace_players_select_member"
  ON public.workspace_players FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- All writes go through SECURITY DEFINER RPCs only.
-- No INSERT/UPDATE/DELETE policies — direct client writes are blocked.
