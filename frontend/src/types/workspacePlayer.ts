/**
 * A workspace "known player" — an account that has linked to at least one
 * tournament entry in this workspace. Kept separate from the hook that fetches
 * them so presentational components can use the type and the name helper
 * without pulling in the Supabase client.
 */
export interface WorkspacePlayer {
  user_id: string;
  preferred_name: string | null;
  display_name: string | null;
  created_at: string;
  tournaments_played: number;
}

/** Name to show for a known player: workspace nickname → profile name → fallback. */
export function knownPlayerName(p: WorkspacePlayer): string {
  return p.preferred_name || p.display_name || "Player";
}
