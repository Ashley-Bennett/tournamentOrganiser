import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import type { EquippedSlot } from "../badges/card";

/**
 * The signed-in player's saved card for one game.
 *
 * Deliberately raw: this returns the equipped slot rows exactly as stored —
 * a badge id and the league it was earned at, and nothing else. Counts and
 * titles are not the card's business, they belong to the badges, and joining
 * the two here would mean the editor and the pairing board each had their own
 * idea of what a slot means. `hydrateSlots` does that join for both.
 *
 * Read is a plain select, because `player_card` is own-rows RLS. Write is not:
 * it goes through save_my_card, which replaces the whole loadout atomically so
 * a dropped connection cannot leave somebody wearing half a card.
 */

interface CardRow {
  partner_key: string | null;
}

interface SlotRow {
  slot: number;
  badge_id: string;
  workspace_id: string | null;
}

export interface CardLoadout {
  /** Null means the player has not chosen, and the game's default applies. */
  partnerKey: string | null;
  slots: EquippedSlot[];
}

export const EMPTY_LOADOUT: CardLoadout = { partnerKey: null, slots: [] };

export function useMyCard(gameId: string | null) {
  const [loadout, setLoadout] = useState<CardLoadout>(EMPTY_LOADOUT);
  const [loading, setLoading] = useState(gameId !== null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!gameId) {
      setLoadout(EMPTY_LOADOUT);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [card, slots] = await Promise.all([
      supabase
        .from("player_card")
        .select("partner_key")
        .eq("game_id", gameId)
        .maybeSingle(),
      supabase
        .from("player_card_slot")
        .select("slot, badge_id, workspace_id")
        .eq("game_id", gameId)
        .order("slot"),
    ]);

    const failure = card.error ?? slots.error;
    if (failure) {
      setError(failure.message || "Could not load your card");
      // Left as whatever was already on screen rather than blanked: a failed
      // reload should not make it look like the card was wiped.
      setLoading(false);
      return;
    }

    setLoadout({
      partnerKey: (card.data as CardRow | null)?.partner_key ?? null,
      slots: ((slots.data ?? []) as SlotRow[]).map((r) => ({
        slot: r.slot,
        badgeId: r.badge_id,
        workspaceId: r.workspace_id,
      })),
    });
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    let stale = false;
    void load().then(() => {
      if (stale) return;
    });
    return () => {
      stale = true;
    };
  }, [load]);

  /**
   * Write the whole loadout.
   *
   * Optimistic: the preview updates before the round trip, because the editor
   * is direct manipulation and a slot that waits half a second to fill reads
   * as a click that missed. A failed save reloads from the server rather than
   * rolling back to a remembered value, so what is on screen is what is
   * actually stored.
   */
  const save = useCallback(
    async (next: CardLoadout): Promise<boolean> => {
      if (!gameId) return false;
      const previous = loadout;
      setLoadout(next);
      setSaving(true);
      setError(null);

      const { error: rpcError } = await supabase.rpc("save_my_card", {
        p_game_id: gameId,
        // NULL is a meaningful value here — it means "no partner chosen, use
        // the game's default" — but the generated types describe every RPC
        // argument as non-nullable, so the cast says what the function
        // actually accepts.
        p_partner_key: next.partnerKey as string,
        p_slots: next.slots.map((s) => ({
          slot: s.slot,
          badgeId: s.badgeId,
          workspaceId: s.workspaceId,
        })),
      });

      setSaving(false);
      if (rpcError) {
        setError(rpcError.message || "Could not save your card");
        setLoadout(previous);
        return false;
      }
      return true;
    },
    [gameId, loadout],
  );

  return { loadout, loading, error, saving, save, reload: load };
}
