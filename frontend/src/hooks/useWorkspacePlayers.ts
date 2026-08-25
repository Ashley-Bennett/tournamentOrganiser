import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

import type { WorkspacePlayer } from "../types/workspacePlayer";

export { knownPlayerName } from "../types/workspacePlayer";
export type { WorkspacePlayer } from "../types/workspacePlayer";

/**
 * Known players ("regulars") for a workspace — accounts that have linked to at
 * least one tournament entry here. Used by the add-player pickers so a returning
 * player is added already linked to their account, instead of as a loose name
 * that later needs a claim link.
 *
 * Ordered by tournaments played, so the regulars are at the top of the list.
 */
export function useWorkspacePlayers(workspaceId: string | null | undefined) {
  const [players, setPlayers] = useState<WorkspacePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("list_workspace_players", {
      p_workspace_id: workspaceId,
    });

    if (rpcError) {
      setError(rpcError.message || "Failed to load known players");
      setPlayers([]);
    } else {
      setPlayers((data as WorkspacePlayer[]) ?? []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  return { knownPlayers: players, loading, error, refresh: fetchPlayers };
}
