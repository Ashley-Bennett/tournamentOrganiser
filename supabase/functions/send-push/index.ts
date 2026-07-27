// send-push — delivers Web Push notifications for tournament events.
//
// Invoked server-to-server by Postgres (pg_net) from the triggers/cron in
// migration 20260727100000_web_push.sql, authenticated with a shared secret.
// Reads with the service role (bypasses RLS by design), resolves the target
// subscriptions for the event, signs each message with VAPID, and prunes
// subscriptions the push service reports as gone (404/410).
//
// Deploy with JWT verification OFF (auth is the shared secret below):
//   supabase functions deploy send-push --no-verify-jwt
// Secrets: SEND_PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface Payload {
  type: "pairing_up" | "time_up" | "standings_ready";
  tournament_id: string;
  round?: number;
}

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface TargetRow {
  tournament_player_id: string | null;
  is_organiser: boolean;
  push_subscriptions: Subscription | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHARED_SECRET = Deno.env.get("SEND_PUSH_SECRET") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@matchamp.win";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!SHARED_SECRET || req.headers.get("Authorization") !== `Bearer ${SHARED_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { type, tournament_id, round } = payload;
  if (!type || !tournament_id) {
    return new Response("Bad request", { status: 400 });
  }

  // All subscription targets for this tournament, with their subscription.
  const { data: targets } = await admin
    .from("push_subscription_targets")
    .select("tournament_player_id, is_organiser, push_subscriptions(id, endpoint, p256dh, auth)")
    .eq("tournament_id", tournament_id);

  const rows = (targets ?? []) as unknown as TargetRow[];
  if (rows.length === 0) return json({ sent: 0 });

  // Round context for pairing personalisation and round membership.
  const roundPlayerIds = new Set<string>();
  const matchByPlayer = new Map<
    string,
    { table: number | null; oppName: string | null; bye: boolean }
  >();

  if (type === "pairing_up" || type === "time_up") {
    const { data: matches } = await admin
      .from("tournament_matches")
      .select("match_number, player1_id, player2_id, status")
      .eq("tournament_id", tournament_id)
      .eq("round_number", round ?? -1);

    const ids = new Set<string>();
    for (const m of matches ?? []) {
      ids.add(m.player1_id);
      if (m.player2_id) ids.add(m.player2_id);
    }
    const { data: players } = await admin
      .from("tournament_players")
      .select("id, name")
      .in("id", Array.from(ids));
    const nameOf = new Map((players ?? []).map((p) => [p.id, p.name as string]));

    for (const m of matches ?? []) {
      const bye = !m.player2_id || m.status === "bye";
      roundPlayerIds.add(m.player1_id);
      matchByPlayer.set(m.player1_id, {
        table: m.match_number,
        oppName: bye ? null : nameOf.get(m.player2_id) ?? null,
        bye,
      });
      if (m.player2_id) {
        roundPlayerIds.add(m.player2_id);
        matchByPlayer.set(m.player2_id, {
          table: m.match_number,
          oppName: nameOf.get(m.player1_id) ?? null,
          bye: false,
        });
      }
    }
  }

  const url = `/t/${tournament_id}/me`;

  // Resolve one message per endpoint (a browser may match several target rows).
  const toSend = new Map<string, { sub: Subscription; title: string; body: string }>();

  for (const row of rows) {
    const s = row.push_subscriptions;
    if (!s || toSend.has(s.endpoint)) continue;

    let body: string | null = null;
    if (type === "standings_ready") {
      body = "All rounds complete — final standings are ready!";
    } else if (type === "time_up") {
      if (row.is_organiser || (row.tournament_player_id && roundPlayerIds.has(row.tournament_player_id))) {
        body = `Time's up for Round ${round}!`;
      }
    } else if (type === "pairing_up") {
      if (row.tournament_player_id && roundPlayerIds.has(row.tournament_player_id)) {
        const m = matchByPlayer.get(row.tournament_player_id);
        if (!m) body = `Round ${round} pairings are up!`;
        else if (m.bye) body = `Round ${round}: you have a bye this round.`;
        else {
          const where = m.table != null ? `Table ${m.table}` : "your table";
          body = `Round ${round} is up — ${where} vs ${m.oppName ?? "your opponent"}`;
        }
      }
    }

    if (body) toSend.set(s.endpoint, { sub: s, title: "Matchamp", body });
  }

  if (toSend.size === 0) return json({ sent: 0 });

  let sent = 0;
  const deadSubIds: string[] = [];

  await Promise.all(
    [...toSend.values()].map(async ({ sub, title, body }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url }),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          deadSubIds.push(sub.id);
        } else {
          console.error("push failed", status, (err as Error)?.message);
        }
      }
    }),
  );

  if (deadSubIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", deadSubIds);
  }

  return json({ sent, pruned: deadSubIds.length });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
