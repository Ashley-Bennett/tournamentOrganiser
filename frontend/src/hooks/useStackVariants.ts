import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Whether the stats pages fold deck variants together — Mega Lucario / Hariyama
 * counted as Mega Lucario (see deck_stats_key in the database for the rule).
 *
 * The query string is the source of truth, like the drill-down stack: a pasted
 * drill-down link has to carry it, because "Mega Lucario" means a different set
 * of entries stacked than unstacked. localStorage only supplies the default for
 * a visit that arrives without the parameter.
 */

export const STACK_PARAM = "stack";
const STORAGE_KEY = "matchamp_stats_stack_variants";

export function readStoredStack(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw; unstacked is the default.
    return false;
  }
}

function writeStoredStack(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Not being able to remember the preference is not worth surfacing.
  }
}

export function useStackVariants(): [boolean, (on: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(STACK_PARAM);
  const stacked = raw != null ? raw === "1" : readStoredStack();

  const setStacked = useCallback(
    (on: boolean) => {
      writeStoredStack(on);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (on) next.set(STACK_PARAM, "1");
          else next.delete(STACK_PARAM);
          return next;
        },
        // A view preference, not a navigation step — back should not undo it.
        { replace: true },
      );
    },
    [setParams],
  );

  return [stacked, setStacked];
}
