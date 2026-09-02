// ── Stats drill-down navigation ──────────────────────────────────────────────
// A deck opens its pilots, a pilot opens their decks and opponents, an opponent
// opens theirs. The chain has no natural end, so stacking a dialog per step is
// not an option — one dialog holds a view stack instead.
//
// The stack lives in the URL rather than component state, which buys three
// things: the browser and Android back buttons pop it for free, a drill-down is
// a link an organiser can paste into a club chat, and there is a single source
// of truth so the dialog and the address bar cannot disagree.

export type DetailView =
  | {
      kind: "deck";
      p1: number | null;
      p2: number | null;
      /**
       * True only when opened from the meta share table, whose numbers describe
       * a chosen set of events — the drill-down then covers the same events so
       * the totals reconcile.
       *
       * A deck opened from a player, or from a pasted link, has no such window
       * and must cover everything: inheriting a scope it never asked for is how
       * a deck someone demonstrably played showed up with no entries at all.
       */
      scoped: boolean;
    }
  | { kind: "player"; identityKey: string };

/** The query parameter the stack is serialised into. */
export const DRILL_PARAM = "drill";

function encodeView(v: DetailView): string {
  if (v.kind === "player") return `player:${encodeURIComponent(v.identityKey)}`;
  // Scope has to survive serialisation: the URL is the source of truth, so a
  // field that is not encoded is lost on the very next push.
  return `deck:${v.p1 ?? ""}-${v.p2 ?? ""}${v.scoped ? ":scoped" : ""}`;
}

function decodeView(raw: string): DetailView | null {
  const sep = raw.indexOf(":");
  if (sep === -1) return null;
  const kind = raw.slice(0, sep);
  const rest = raw.slice(sep + 1);

  if (kind === "player") {
    const identityKey = decodeURIComponent(rest);
    return identityKey ? { kind: "player", identityKey } : null;
  }

  if (kind === "deck") {
    const [slots, flag] = rest.split(":");
    // "6-18", "6-" and "-" are all legitimate: a deck can have one slot or none.
    const dash = slots.indexOf("-");
    if (dash === -1) return null;
    const num = (s: string) => {
      if (s === "") return null;
      const n = Number(s);
      return Number.isInteger(n) ? n : NaN;
    };
    const p1 = num(slots.slice(0, dash));
    const p2 = num(slots.slice(dash + 1));
    if (Number.isNaN(p1) || Number.isNaN(p2)) return null;
    return { kind: "deck", p1, p2, scoped: flag === "scoped" };
  }

  return null;
}

/** Reads the stack out of a query string. Unparseable entries are dropped. */
export function parseDrill(param: string | null): DetailView[] {
  if (!param) return [];
  return param
    .split(",")
    .map(decodeView)
    .filter((v): v is DetailView => v !== null);
}

/** Serialises a stack; an empty stack means the parameter should be removed. */
export function serialiseDrill(stack: DetailView[]): string | null {
  return stack.length === 0 ? null : stack.map(encodeView).join(",");
}

export function sameView(a: DetailView, b: DetailView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "deck" && b.kind === "deck") {
    return a.p1 === b.p1 && a.p2 === b.p2 && a.scoped === b.scoped;
  }
  if (a.kind === "player" && b.kind === "player") {
    return a.identityKey === b.identityKey;
  }
  return false;
}

/**
 * Pushes a view, unless it is already on top — clicking through to the player
 * you are already looking at should not add a step you then have to back out of.
 */
export function pushView(stack: DetailView[], view: DetailView): DetailView[] {
  const top = stack[stack.length - 1];
  if (top && sameView(top, view)) return stack;
  return [...stack, view];
}

/**
 * A readable name for a player crumb that has not been rendered yet.
 *
 * Labels are normally learned when a view loads and reports its own name, but a
 * pasted link opens straight to the deepest step — every crumb above it would
 * otherwise read "Player". Accountless identities are keyed "name:<lowercased>",
 * which is enough to recover a decent label with no extra fetch. An account is
 * keyed by uuid and cannot be resolved this way.
 */
export function playerNameFromKey(identityKey: string): string | null {
  if (!identityKey.startsWith("name:")) return null;
  const raw = identityKey.slice("name:".length).trim();
  if (!raw) return null;
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
