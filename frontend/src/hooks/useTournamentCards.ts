import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { assembleCard, type CardSlot, type PlayerCard } from "../badges/card";

/**
 * Everyone's card for one tournament, keyed by tournament_player id.
 *
 * This is the read path that made the badges worth saving. It runs on a
 * projector and on the phones of players with no account, so it cannot go near
 * the identity matching that works badges out — that is member-only and rightly
 * refuses. The RPC reads saved rows and derives nothing.
 *
 * Failure is silent on purpose. A card is chrome around somebody's name in a
 * room full of people: if this does not load, every name still renders exactly
 * as it did before badges existed, and nobody's round is held up by it. There
 * is no error state to show because there is no action to offer.
 */

interface CardRow {
  tournament_player_id: string;
  partner_key: string | null;
  slots: CardSlot[] | null;
}

export function useTournamentCards(
  tournamentId: string | null | undefined,
  gameId: string | null,
) {
  const [cards, setCards] = useState<Map<string, PlayerCard>>(new Map());

  useEffect(() => {
    if (!tournamentId) {
      setCards(new Map());
      return;
    }
    let stale = false;

    void (async () => {
      const { data, error } = await supabase.rpc(
        "get_tournament_player_cards",
        { p_tournament_id: tournamentId },
      );
      if (stale) return;
      if (error) {
        setCards(new Map());
        return;
      }

      const next = new Map<string, PlayerCard>();
      for (const row of (data ?? []) as CardRow[]) {
        next.set(
          row.tournament_player_id,
          assembleCard({
            gameId,
            partnerKey: row.partner_key,
            slots: row.slots ?? [],
          }),
        );
      }
      setCards(next);
    })();

    return () => {
      stale = true;
    };
  }, [tournamentId, gameId]);

  return cards;
}
