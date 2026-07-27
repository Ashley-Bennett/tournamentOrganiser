/**
 * One-off backfill: compute + store final standings for already-completed
 * tournaments, using the SAME tiebreaker code the app displays, so persisted
 * placings match exactly. New completions store standings automatically
 * (see useRoundLifecycle.handleCompleteTournament); this covers old ones.
 *
 * Run with the SERVICE ROLE key (bypasses RLS):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-standings.ts
 */
import { createClient } from "@supabase/supabase-js";
import { buildStandingsFromMatches } from "../src/utils/tournamentUtils";
import { sortByTieBreakers } from "../src/utils/tieBreaking";
import type { MatchWithPlayers } from "../src/types/match";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: tournaments, error } = await db
    .from("tournaments")
    .select("id, workspace_id, name")
    .eq("status", "completed");
  if (error) throw error;

  let done = 0;
  for (const t of tournaments ?? []) {
    const [{ data: players }, { data: matches }] = await Promise.all([
      db.from("tournament_players").select("id, name, dropped").eq("tournament_id", t.id),
      db.from("tournament_matches").select("*").eq("tournament_id", t.id),
    ]);

    const nameOf = new Map((players ?? []).map((p) => [p.id, p.name as string]));
    const enriched = ((matches ?? []) as Record<string, unknown>[]).map((m) => ({
      ...m,
      player1_name: nameOf.get(m.player1_id as string) ?? "Unknown",
      player2_name: m.player2_id ? nameOf.get(m.player2_id as string) ?? "Unknown" : null,
      winner_name: m.winner_id ? nameOf.get(m.winner_id as string) ?? "Unknown" : null,
    })) as unknown as MatchWithPlayers[];

    const completed = enriched.filter(
      (m) => m.status === "completed" || m.status === "bye",
    );
    const raw = buildStandingsFromMatches(
      completed,
      (players ?? []).map((p) => ({ id: p.id, name: p.name as string })),
    );
    const droppedIds = new Set(
      (players ?? []).filter((p) => p.dropped).map((p) => p.id),
    );
    const sorted = sortByTieBreakers(raw, droppedIds);

    if (sorted.length === 0) {
      console.log(`- skip "${t.name}" (no players/results)`);
      continue;
    }

    const rows = sorted.map((s, i) => ({
      tournament_id: t.id,
      workspace_id: t.workspace_id,
      player_id: s.id,
      position: i + 1,
      match_points: s.matchPoints,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      matches_played: s.matchesPlayed,
      byes_received: s.byesReceived ?? 0,
    }));

    await db.from("tournament_standings").delete().eq("tournament_id", t.id);
    const { error: insErr } = await db.from("tournament_standings").insert(rows);
    if (insErr) {
      console.error(`! "${t.name}": ${insErr.message}`);
      continue;
    }
    done++;
    console.log(`✓ "${t.name}" — ${rows.length} placings`);
  }
  console.log(`\nBackfilled ${done} tournament(s).`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
