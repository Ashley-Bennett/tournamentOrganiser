import { GAMES } from "./registry";
import { getArtworkUrl, getSpriteUrl } from "../utils/pokemonCache";
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
 * Which rendering is wanted, matching how deck choosing already draws Pokémon.
 *
 * `sprite` is the small pixel art used in the search list — 32px, rendered
 * pixelated. `artwork` is the official illustration used for the chosen slot —
 * 56px, object-fit contain. The partner picker uses the same pair so choosing
 * a partner looks and behaves like choosing a deck.
 */
export type PartnerImageVariant = "sprite" | "artwork";

/**
 * The image for a partner key, or null when there is nothing to draw.
 *
 * Falls back to the game's default rather than to nothing: a key that no
 * longer resolves — a set item withdrawn, or a card written by an older
 * client — should show the starting partner, not a hole in the card.
 */
export function partnerImage(
  gameId: string | null,
  key: string | null,
  variant: PartnerImageVariant = "sprite",
): string | null {
  const source = partnerSourceFor(gameId);
  if (source.kind === "none") return null;

  const wanted = key ?? source.defaultKey;

  if (source.kind === "pokemon") {
    const asked = Number(wanted);
    const id =
      Number.isInteger(asked) && asked > 0 ? asked : Number(source.defaultKey);
    return variant === "artwork" ? getArtworkUrl(id) : getSpriteUrl(id);
  }

  // A declared set ships one asset per option. These are drawn as vectors, so
  // the same file serves both sizes and there is no second variant to pick.
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
