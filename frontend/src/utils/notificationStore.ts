// ── Persisted player notifications ───────────────────────────────────────────
// The events raised by TournamentWatcher used to live only for the ten seconds
// a Snackbar was on screen. A player mid-match, with the phone in a pocket, or
// reloading the page simply missed them — including the one that matters most
// ("your round is up, table 6").
//
// This is the store those events are written to instead. The Snackbar becomes
// one reader of it; the header bell will be another.
//
// Deliberately client-side: players are device_token identities rather than
// Supabase auth users, so a server table would need a new RLS surface for
// anonymous reads — and round events are derived, cheap to recompute, and
// worthless a day later. Badge unlocks are durable and account-scoped, so those
// will arrive from the server; `source` exists so both can coexist.
//
// NOTE: the storage key must NOT start with "tj_" — playerStorage.getAllEntries
// treats every such key as a joined-tournament entry.

const STORE_KEY = "mc_notifications";

/** Newest N kept; older entries are evicted on write. */
const MAX_ENTRIES = 50;

/** Anything older than this is dropped when the store is read. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type NotificationType =
  | "round_published"
  | "round_time_up"
  | "result_needed"
  | "tournament_completed";

export interface StoredNotification {
  /**
   * Deterministic, so re-deriving the same event is a no-op rather than a
   * duplicate row. TournamentWatcher reseeds its baselines on every mount, so
   * today a reload raises nothing — but idempotency here is structural rather
   * than relying on that.
   */
  id: string;
  type: NotificationType;
  tournamentId: string;
  tournamentName: string | null;
  message: string;
  /** Where tapping the notification takes the player. */
  href: string;
  createdAt: string;
  readAt: string | null;
  /** Local events are derived on-device; server events will arrive with grants. */
  source: "local" | "server";
}

export type NewNotification = Omit<
  StoredNotification,
  "id" | "createdAt" | "readAt" | "source"
> & {
  /** Included in the id, so one event per round rather than one per poll. */
  roundNumber?: number;
  source?: StoredNotification["source"];
};

/** `{tournamentId}:{type}`, plus the round where one applies. */
export function notificationId(
  tournamentId: string,
  type: NotificationType,
  roundNumber?: number,
): string {
  return roundNumber == null
    ? `${tournamentId}:${type}`
    : `${tournamentId}:${type}:${roundNumber}`;
}

// ── Listeners ────────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to store changes — including writes from another tab. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORE_KEY) emit();
  });
}

// ── Read / write ─────────────────────────────────────────────────────────────

function isNotification(v: unknown): v is StoredNotification {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Partial<StoredNotification>;
  return (
    typeof n.id === "string" &&
    typeof n.type === "string" &&
    typeof n.tournamentId === "string" &&
    typeof n.message === "string" &&
    typeof n.createdAt === "string"
  );
}

function read(): StoredNotification[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNotification);
  } catch {
    // A corrupt store resets to empty rather than taking the app down.
    return [];
  }
}

function write(list: StoredNotification[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // Quota or private-mode failures are not worth breaking a round over.
  }
  emit();
}

function fresh(list: StoredNotification[], now: number): StoredNotification[] {
  return list.filter((n) => {
    const at = new Date(n.createdAt).getTime();
    return Number.isFinite(at) && now - at < MAX_AGE_MS;
  });
}

/** Newest first, with expired entries pruned. */
export function getNotifications(now = Date.now()): StoredNotification[] {
  return fresh(read(), now).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Records an event. Returns the stored notification, or null when one with the
 * same id already exists — callers use that to decide whether to also raise a
 * toast, so a repeated derivation stays silent.
 */
export function addNotification(
  input: NewNotification,
  now = Date.now(),
): StoredNotification | null {
  const { roundNumber, source = "local", ...rest } = input;
  const id = notificationId(input.tournamentId, input.type, roundNumber);

  const list = fresh(read(), now);
  if (list.some((n) => n.id === id)) return null;

  const entry: StoredNotification = {
    ...rest,
    id,
    source,
    createdAt: new Date(now).toISOString(),
    readAt: null,
  };
  write([entry, ...list]);
  return entry;
}

export function unreadCount(now = Date.now()): number {
  return fresh(read(), now).filter((n) => n.readAt === null).length;
}

export function markRead(id: string, now = Date.now()) {
  const list = read();
  if (!list.some((n) => n.id === id && n.readAt === null)) return;
  write(
    list.map((n) =>
      n.id === id ? { ...n, readAt: new Date(now).toISOString() } : n,
    ),
  );
}

export function markAllRead(now = Date.now()) {
  const list = read();
  if (!list.some((n) => n.readAt === null)) return;
  const at = new Date(now).toISOString();
  write(list.map((n) => (n.readAt === null ? { ...n, readAt: at } : n)));
}

/**
 * Drops a single notification because the thing it was asking for has happened.
 *
 * Actionable prompts ("Round 3 needs your result") are noise once actioned, so
 * they are removed rather than marked read — the round_published event for the
 * same round is still in the list as history.
 */
export function resolveNotification(id: string) {
  const list = read();
  const kept = list.filter((n) => n.id !== id);
  if (kept.length !== list.length) write(kept);
}

/**
 * Drops a tournament's notifications. Called alongside playerStorage.clearEntry
 * so an entry whose credentials stopped working does not leave orphaned rows
 * pointing at a tournament the player can no longer open.
 */
export function clearTournament(tournamentId: string) {
  const list = read();
  const kept = list.filter((n) => n.tournamentId !== tournamentId);
  if (kept.length !== list.length) write(kept);
}

export function clearAll() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
  emit();
}
