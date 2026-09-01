import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * One read-only stats RPC, fetched whenever its arguments change.
 *
 * Every stats section was hand-rolling the same effect, and the later ones
 * dropped two things the earlier ones had:
 *
 * 1. A stale-response guard. The period and game pickers sit above all of these
 *    sections, so changing either re-fires every fetch at once. Without the
 *    guard a slow first response can land after a fast second one and paint the
 *    previous period's numbers, with nothing on screen to say so.
 *
 * 2. Any notice that the call failed. `data` comes back null on error, which
 *    every section turned into an empty array and then into "no events in this
 *    period yet" — a failure reported as a fact about the workspace.
 *
 * `error` is the message to show; the caller decides where. Rows stay empty on
 * failure so a section never mixes stale numbers with an error banner.
 */
export function useStatsRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  deps: unknown[],
): { rows: T[]; loading: boolean; error: string | null } {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void supabase.rpc(fn, args).then(({ data, error: err }) => {
      if (cancelled) return;
      setError(err ? err.message : null);
      setRows(err ? [] : ((data ?? []) as T[]));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // `args` is rebuilt on every render, so the caller passes the values that
    // actually identify the query instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { rows, loading, error };
}

/**
 * The same, for an RPC that returns a single summary row rather than a list.
 * `row` is null both when the query is empty and when it failed — check
 * `error` before reading anything into a null.
 */
export function useStatsRpcRow<T>(
  fn: string,
  args: Record<string, unknown>,
  deps: unknown[],
): { row: T | null; loading: boolean; error: string | null } {
  const { rows, loading, error } = useStatsRpc<T>(fn, args, deps);
  return { row: rows.length > 0 ? rows[0] : null, loading, error };
}
