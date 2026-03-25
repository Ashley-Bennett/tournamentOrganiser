// ── Player localStorage / cookie helpers ─────────────────────────────────────
// Shared between TournamentJoin and PlayerTournamentView.
// Players are not Supabase auth users — they're identified by a device_token
// generated at join time and cached here for the duration of the tournament.

const PROFILE_KEY = "tj_profile";

export interface TjProfile {
  name: string;
  deviceId: string;
}

export interface TjEntry {
  playerId: string;
  deviceToken: string;
  joinedAt: string;
  tournamentName?: string;
}

export function entryKey(tournamentId: string) {
  return `tj_${tournamentId}`;
}

export function getProfile(): TjProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as TjProfile;
  } catch {
    // ignore parse errors
  }
  const newProfile: TjProfile = {
    name: "",
    deviceId: crypto.randomUUID(),
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(newProfile));
  return newProfile;
}

export function saveProfile(name: string, deviceId: string) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, deviceId }));
}

export function getEntry(tournamentId: string): TjEntry | null {
  try {
    const lsRaw = localStorage.getItem(entryKey(tournamentId));
    if (lsRaw) return JSON.parse(lsRaw) as TjEntry;
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${entryKey(tournamentId)}=`));
    if (cookie) return JSON.parse(decodeURIComponent(cookie.split("=")[1])) as TjEntry;
  } catch {
    // ignore parse errors
  }
  return null;
}

export function saveEntry(tournamentId: string, entry: TjEntry) {
  localStorage.setItem(entryKey(tournamentId), JSON.stringify(entry));
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${entryKey(tournamentId)}=${encodeURIComponent(JSON.stringify(entry))}; expires=${expires}; path=/; SameSite=Lax`;
}

/** Returns all stored tournament entries, each paired with its tournament ID. */
export function getAllEntries(): Array<{ tournamentId: string } & TjEntry> {
  const results: Array<{ tournamentId: string } & TjEntry> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("tj_") || key === PROFILE_KEY) continue;
    const tournamentId = key.slice(3); // strip "tj_"
    try {
      const raw = localStorage.getItem(key);
      if (raw) results.push({ tournamentId, ...(JSON.parse(raw) as TjEntry) });
    } catch {
      // ignore
    }
  }
  return results;
}

export function clearEntry(tournamentId: string) {
  localStorage.removeItem(entryKey(tournamentId));
  document.cookie = `${entryKey(tournamentId)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}
