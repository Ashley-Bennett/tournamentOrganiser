import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Snackbar, Alert, Button, Box } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { getAllEntries, clearEntry } from "../utils/playerStorage";
import {
  addNotification,
  clearTournament,
  notificationId,
  resolveNotification,
  type NewNotification,
} from "../utils/notificationStore";
import { useAttentionAlert } from "../hooks/useAttentionAlert";

/**
 * App-level player notifications.
 *
 * Watches every tournament this device has joined (from localStorage) and
 * surfaces a snackbar — with a "View round" quick-link — no matter which page
 * the player is on (stats, account, dashboard, …). This is the single source of
 * truth for the individual player's alerts; the tournament pages themselves no
 * longer raise their own toast, so there's no double-firing.
 *
 * Still the "page-open" layer (Phase 1): the app must be open in a tab.
 * Background/closed delivery is Phase 2 (web push).
 */

interface WatcherMatch {
  round_number: number;
  match_number: number | null;
  player1_id: string;
  player2_id: string | null;
  player1_name: string;
  player2_name: string | null;
  status: "ready" | "pending" | "completed" | "bye";
  pairings_published: boolean;
  is_my_match: boolean;
}

interface WatcherView {
  tournament: {
    id: string;
    name: string;
    status: string;
    round_duration_minutes: number | null;
    current_round_started_at: string | null;
    round_elapsed_seconds: number | null;
    round_is_paused: boolean | null;
  };
  player: { id: string };
  matches: WatcherMatch[];
  /** The player's own submitted result for their current match, if any. */
  my_report: { reported_outcome: "win" | "loss" | "draw" } | null;
}

export interface PlayerAlert {
  tournamentId: string;
  message: string;
}

/** Where a notification for this tournament takes the player when tapped. */
function playerHref(tournamentId: string) {
  return `/t/${tournamentId}/me`;
}

// ── One headless watcher per joined tournament ──────────────────────────────
function TournamentWatcher({
  tournamentId,
  playerId,
  deviceToken,
  onAlert,
}: {
  tournamentId: string;
  playerId: string;
  deviceToken: string | null;
  onAlert: (n: NewNotification) => void;
}) {
  const [view, setView] = useState<WatcherView | null>(null);
  const initialLoadedRef = useRef(false);
  const prevRoundCountRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);
  const expiredAlertRoundRef = useRef<number | null>(null);

  // Keep the latest onAlert without re-subscribing when it changes identity.
  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("get_player_tournament_view", {
        p_tournament_id: tournamentId,
        p_player_id: playerId,
        p_device_token: deviceToken,
      });
      if (stopped || error || !data) {
        // Player was removed — forget this entry so we stop watching it.
        if (error?.message.includes("Invalid player credentials")) {
          clearEntry(tournamentId);
          // Don't leave notifications pointing at a tournament we can no
          // longer open.
          clearTournament(tournamentId);
        }
        return;
      }

      const d = data as WatcherView;
      setView(d);

      const publishedRounds = [
        ...new Set(
          d.matches
            .filter((m) => m.pairings_published || m.status !== "ready")
            .map((m) => m.round_number),
        ),
      ];
      const roundCount = publishedRounds.length;
      const status = d.tournament.status;

      // First load only seeds the baselines — never alerts.
      if (!initialLoadedRef.current) {
        initialLoadedRef.current = true;
        prevRoundCountRef.current = roundCount;
        prevStatusRef.current = status;
        return;
      }

      if (roundCount > prevRoundCountRef.current) {
        const newRound = Math.max(...publishedRounds);
        const mine = d.matches.find(
          (m) => m.is_my_match && m.round_number === newRound,
        );
        let message: string;
        if (!mine) {
          message = `Round ${newRound} pairings are up!`;
        } else if (mine.player2_id === null || mine.status === "bye") {
          message = `Round ${newRound}: you have a bye this round.`;
        } else {
          const oppName =
            mine.player1_id === d.player.id
              ? mine.player2_name
              : mine.player1_name;
          const where =
            mine.match_number != null
              ? `Table ${mine.match_number}`
              : "your table";
          message = `Round ${newRound} is up. ${where} vs ${oppName ?? "your opponent"}`;
        }
        onAlertRef.current({
          type: "round_published",
          tournamentId,
          tournamentName: d.tournament.name ?? null,
          message,
          href: playerHref(tournamentId),
          roundNumber: newRound,
        });
      }
      prevRoundCountRef.current = roundCount;

      if (status === "completed" && prevStatusRef.current !== "completed") {
        onAlertRef.current({
          type: "tournament_completed",
          tournamentId,
          tournamentName: d.tournament.name ?? null,
          message: "All rounds are done. Final standings are ready.",
          href: playerHref(tournamentId),
        });
      }
      prevStatusRef.current = status;

      // A "needs your result" prompt is noise the moment the result lands, so
      // drop it rather than leaving it sitting in the inbox. my_report is
      // view-level — there is only ever one match of mine in play at a time.
      d.matches
        .filter((m) => m.is_my_match)
        .forEach((m) => {
          const settled =
            m.status === "completed" ||
            m.status === "bye" ||
            (m.status === "pending" && d.my_report !== null);
          if (settled) {
            resolveNotification(
              notificationId(tournamentId, "result_needed", m.round_number),
            );
          }
        });
    };

    void load();
    // Background poll (slower than a focused page — realtime carries the load).
    const pollId = setInterval(() => void load(), 20_000);

    const channel = supabase
      .channel(`notify-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${tournamentId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      stopped = true;
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [tournamentId, playerId, deviceToken]);

  // Round-timer expiry: fire once per round, and suppress if the timer had
  // already run out when we first observed the round (see TournamentPairings).
  const activeTimerRound = useMemo(() => {
    const pending = (view?.matches ?? [])
      .filter((m) => m.status === "pending")
      .map((m) => m.round_number);
    return pending.length > 0 ? Math.max(...pending) : null;
  }, [view]);

  useEffect(() => {
    const t = view?.tournament;
    if (!t?.round_duration_minutes || !t.current_round_started_at || t.round_is_paused)
      return;
    if (activeTimerRound == null) return;
    if (expiredAlertRoundRef.current === activeTimerRound) return;

    const totalElapsedMs =
      (t.round_elapsed_seconds ?? 0) * 1000 +
      (Date.now() - new Date(t.current_round_started_at).getTime());
    const remainingMs = t.round_duration_minutes * 60_000 - totalElapsedMs;

    if (remainingMs <= 0) {
      expiredAlertRoundRef.current = activeTimerRound;
      return;
    }

    const roundForAlert = activeTimerRound;
    const timeoutId = window.setTimeout(() => {
      expiredAlertRoundRef.current = roundForAlert;

      // If the player still owes a result, ask for that instead of announcing
      // the time — same moment, one notification, and the useful one.
      const mine = (view?.matches ?? []).find(
        (m) => m.is_my_match && m.round_number === roundForAlert,
      );
      const owesResult =
        mine != null &&
        mine.status === "pending" &&
        mine.player2_id !== null &&
        view?.my_report == null;

      onAlertRef.current(
        owesResult
          ? {
              type: "result_needed",
              tournamentId,
              tournamentName: t.name ?? null,
              message: `Round ${roundForAlert} needs your result`,
              href: playerHref(tournamentId),
              roundNumber: roundForAlert,
            }
          : {
              type: "round_time_up",
              tournamentId,
              tournamentName: t.name ?? null,
              message: `Time's up for Round ${roundForAlert}!`,
              href: playerHref(tournamentId),
              roundNumber: roundForAlert,
            },
      );
    }, remainingMs);
    return () => clearTimeout(timeoutId);
  }, [view, activeTimerRound, tournamentId]);

  return null;
}

// ── Provider mounted once at app root ───────────────────────────────────────
export default function PlayerNotifications() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useAttentionAlert();
  const [alert, setAlert] = useState<PlayerAlert | null>(null);

  // Re-scan localStorage on navigation so a freshly-joined tournament starts
  // being watched. Entries keyed by tournamentId keep watcher identity stable,
  // so unchanged tournaments are never re-subscribed.
  const entries = useMemo(
    () => getAllEntries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.pathname],
  );

  const handleAlert = useCallback(
    (n: NewNotification) => {
      // Record first, always. A duplicate id returns null, which is how a
      // re-derived event stays silent instead of re-toasting.
      const stored = addNotification(n);
      if (!stored) return;

      // When OS push is granted, the service worker shows the notification for
      // every event (foreground included) — so skip the in-app toast to avoid
      // doubling up. The event is still recorded above, so the app keeps its
      // own copy of anything the OS announced.
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        return;
      }
      setAlert({ tournamentId: n.tournamentId, message: n.message });
      notify(n.message);
    },
    [notify],
  );

  // When a push notification is tapped, the service worker asks us to route to
  // the pairing page (rather than leaving the player wherever they were).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === "matchamp:navigate" && typeof data.url === "string") {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  const goToRound = () => {
    if (alert) navigate(`/t/${alert.tournamentId}/me`);
    setAlert(null);
  };

  return (
    <>
      {entries.map((e) => (
        <TournamentWatcher
          key={e.tournamentId}
          tournamentId={e.tournamentId}
          playerId={e.playerId}
          deviceToken={e.deviceToken}
          onAlert={handleAlert}
        />
      ))}

      <Snackbar
        open={!!alert}
        autoHideDuration={10000}
        onClose={() => setAlert(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="info"
          variant="filled"
          sx={{ width: "100%", alignItems: "center" }}
          action={
            <Box display="flex" gap={0.5} alignItems="center">
              <Button color="inherit" size="small" onClick={goToRound}>
                View round
              </Button>
              <Button color="inherit" size="small" onClick={() => setAlert(null)}>
                Dismiss
              </Button>
            </Box>
          }
        >
          {alert?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
