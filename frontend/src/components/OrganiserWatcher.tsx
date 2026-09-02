import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import {
  notificationId,
  resolveNotification,
  type NewNotification,
} from "../utils/notificationStore";
import {
  baselineOf,
  organiserDiff,
  type OrganiserAlertRow,
  type OrganiserBaseline,
} from "../utils/organiserAlerts";

const POLL_MS = 20_000;

/**
 * Headless watcher for the person running the event.
 *
 * The player watcher is fed by get_player_tournament_view, which authenticates
 * the caller as a player — an organiser is not a player in their own event, so
 * before this the bell had nothing to say to them.
 *
 * One poll covers every active tournament they help run, so this mounts once
 * rather than once per tournament.
 */
export default function OrganiserWatcher({
  onAlert,
}: {
  onAlert: (n: NewNotification) => void;
}) {
  const baselines = useRef(new Map<string, OrganiserBaseline>());
  const onAlertRef = useRef(onAlert);

  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("get_organiser_alert_state");
      if (stopped || error || !data) return;

      const rows = data as OrganiserAlertRow[];
      const seen = new Set<string>();

      for (const row of rows) {
        seen.add(row.tournament_id);
        const prev = baselines.current.get(row.tournament_id) ?? null;
        const { raise, resolve } = organiserDiff(row, prev);

        raise.forEach((n) => onAlertRef.current(n));
        resolve.forEach((r) =>
          resolveNotification(
            notificationId(row.tournament_id, r.type, r.roundNumber),
          ),
        );

        baselines.current.set(row.tournament_id, baselineOf(row));
      }

      // A tournament that finished drops out of the result set. Forget it, so
      // that if it somehow reappears it seeds again rather than firing on a
      // stale comparison.
      for (const id of [...baselines.current.keys()]) {
        if (!seen.has(id)) baselines.current.delete(id);
      }
    };

    void load();
    const pollId = setInterval(() => void load(), POLL_MS);

    return () => {
      stopped = true;
      clearInterval(pollId);
    };
  }, []);

  return null;
}
