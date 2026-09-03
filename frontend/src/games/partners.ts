import { GAMES } from "./registry";
import { getArtworkUrl } from "../utils/pokemonCache";
import type { PartnerOption, PartnerSource } from "./types";

/**
 * Resolving a stored partner_key to something you can draw.
 *
 * Kept out of the registry so that module stays data-only: the tie-break and
 * pairing tests import game rules, and should not drag the sprite cache in
 * with them.
 *
 * A key is only meaningful alongside its game — "132" is Ditto under Pokémon
 * and nothing at all under generic — so every function here takes both.
 */

/**
 * Deliberately looks the game up directly rather than through getGame(), which
 * falls back to the default game for anything it does not recognise.
 *
 * That fallback is right for display chrome — a format label is better wrong
 * than missing. This resolves stored player data, and quietly handing back
 * generic's pawn for a game we do not know would render somebody's card as a
 * partner they never picked. An unknown game has no partner, and says so.
 */
export function partnerSourceFor(gameId: string | null): PartnerSource {
  const game = gameId ? GAMES.find((g) => g.id === gameId) : undefined;
  return game?.partner ?? { kind: "none" };
}

/** True when this game offers a partner slot at all. */
export function hasPartner(gameId: string | null): boolean {
  return partnerSourceFor(gameId).kind !== "none";
}

/** The key to fall back on when a player has not chosen one. */
export function defaultPartnerKey(gameId: string | null): string | null {
  const source = partnerSourceFor(gameId);
  return source.kind === "none" ? null : source.defaultKey;
}

/** The choices to show in the picker. Empty for Pokémon, which is unbounded. */
export function partnerOptions(gameId: string | null): PartnerOption[] {
  const source = partnerSourceFor(gameId);
  return source.kind === "set" ? source.options : [];
}

/**
 * The image for a partner key, or null when there is nothing to draw.
 *
 * There is deliberately **one** image per partner, used everywhere — the
 * picker, the card, the reveal.
 *
 * Deck choosing legitimately uses two renderings: pixel sprites in the search
 * list and official artwork for the chosen slot. That is fine for a deck,
 * which is a fact being recorded. A partner is a picture being chosen, and
 * showing one image while picking and another on the card is a bait and
 * switch — you pick the art you want to show off and get something else.
 * Taking the variant away means it cannot be got wrong by accident.
 *
 * Official artwork is the one, because the card is a showcase and artwork is
 * framed consistently across species where the pixel sprites are not.
 *
 * Falls back to the game's default rather than to nothing: a key that no
 * longer resolves — a set item withdrawn, or a card written by an older
 * client — should show the starting partner, not a hole in the card.
 */
export function partnerImage(
  gameId: string | null,
  key: string | null,
): string | null {
  const source = partnerSourceFor(gameId);
  if (source.kind === "none") return null;

  const wanted = key ?? source.defaultKey;

  if (source.kind === "pokemon") {
    const asked = Number(wanted);
    const id =
      Number.isInteger(asked) && asked > 0 ? asked : Number(source.defaultKey);
    return getArtworkUrl(id);
  }

  // A declared set ships one vector per option, which serves every size.
  const found =
    source.options.find((o) => o.key === wanted) ??
    source.options.find((o) => o.key === source.defaultKey);
  return found?.src ?? null;
}

/** True when the key is one this game can actually resolve. */
export function isValidPartnerKey(
  gameId: string | null,
  key: string,
): boolean {
  const source = partnerSourceFor(gameId);
  if (source.kind === "none") return false;
  if (source.kind === "set") return source.options.some((o) => o.key === key);
  const id = Number(key);
  return Number.isInteger(id) && id > 0;
}
