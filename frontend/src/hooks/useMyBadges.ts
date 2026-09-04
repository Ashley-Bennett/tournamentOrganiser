import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import type { EarnedBadge } from "../badges/types";

/**
 * The signed-in player's badges.
 *
 * Badges are worked out from tournament history and saved to the account, and
 * this is the only thing that triggers that. Nothing else in the app calls
 * refresh_my_badges, so before this hook exists nobody has any badges at all.
 *
 * The refresh runs **once per session**, not once per mount. Recomputing is
 * cheap but not free, and every screen that shows a card would otherwise ask
 * for it again. The promise is shared, so two components mounting together
 * make one call between them.
 */

/** Shared across callers, so a session refreshes once however many ask. */
let refreshOnce: Promise<void> | null = null;

/** Test seam: forget that this session has refreshed. */
export function resetBadgeRefresh() {
  refreshOnce = null;
}

async function refreshBadges(): Promise<void> {
  if (!refreshOnce) {
    // Wrapped in an async IIFE because supabase.rpc returns a thenable rather
    // than a real Promise, so it has no .catch to hang the recovery off.
    refreshOnce = (async () => {
      try {
        const { error } = await supabase.rpc("refresh_my_badges");
        // A failed refresh is not fatal: whatever was saved last time is still
        // readable, and the badges are simply a little stale. Clearing the
        // promise lets the next caller try again.
        if (error) refreshOnce = null;
      } catch {
        refreshOnce = null;
      }
    })();
  }
  return refreshOnce;
}

interface BadgeRow {
  badge_id: string;
  badge_count: number;
  workspace_id: string | null;
  workspace_name: string | null;
  game_id: string | null;
  earned_at?: string[] | null;
}

function toEarned(row: BadgeRow): EarnedBadge {
  return {
    badgeId: row.badge_id,
    count: row.badge_count,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    gameId: row.game_id,
    earnedAt: row.earned_at ?? undefined,
  };
}

export function useMyBadges(enabled = true) {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [loading, setLoading] = useState(enabled);
  /**
   * True only once a fetch has actually finished.
   *
   * `loading` cannot answer this. It starts as `enabled`, so while the auth
   * session is still rehydrating it reads false — and there is a render in
   * which the user has arrived, `load()` has not yet run, and the hook is
   * reporting "not loading" over an empty list. Anything that treats that as
   * a real answer concludes the player holds nothing.
   */
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    await refreshBadges();

    const { data, error: rpcError } = await supabase.rpc("get_my_badges");
    if (rpcError) {
      setError(rpcError.message || "Could not load your badges");
      setBadges([]);
    } else {
      setBadges(((data ?? []) as BadgeRow[]).map(toEarned));
    }
    setLoading(false);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setReady(false);
      return;
    }
    let stale = false;
    void load().then(() => {
      if (stale) return;
    });
    return () => {
      stale = true;
    };
  }, [enabled, load]);

  return { badges, loading, ready, error, reload: load };
}

interface CardGameRow {
  game_id: string;
  entries: number;
  last_played: string;
}

/**
 * The games this account has entered an event for, newest first.
 *
 * The account page offers a card per row here and nothing else: there is no
 * point handing a generic card to somebody who only plays Pokémon. An empty
 * result means no card has been earned yet, and the entry point should not
 * appear at all.
 */
export function useMyCardGames(enabled = true) {
  const [games, setGames] = useState<CardGameRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let stale = false;

    void (async () => {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc("get_my_card_games");
      if (stale) return;
      if (rpcError) {
        setError(rpcError.message || "Could not load your games");
        setGames([]);
      } else {
        setGames((data ?? []) as CardGameRow[]);
      }
      setLoading(false);
    })();

    return () => {
      stale = true;
    };
  }, [enabled]);

  return { games, loading, error, hasCard: games.length > 0 };
}
