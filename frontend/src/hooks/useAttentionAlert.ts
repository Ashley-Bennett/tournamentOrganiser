import { useCallback, useEffect, useRef } from "react";

/**
 * Lightweight "get the player's attention" primitive for the page-open case —
 * the Phase 1 notification layer that works everywhere (including iOS Safari)
 * with no permissions, service worker, or push infrastructure.
 *
 * On `notify(message)` it:
 *   - vibrates the device (best-effort; Android Chrome only, and only after a
 *     prior user interaction — silently ignored where unsupported), and
 *   - flashes the browser-tab title while the page is backgrounded, so a player
 *     who has switched apps still sees "🔔 …" in the tab.
 *
 * The visible toast itself is left to the caller (an MUI Snackbar), so this hook
 * stays UI-agnostic and reusable across the pairings and player views.
 */
export function useAttentionAlert() {
  const originalTitleRef = useRef<string>(
    typeof document !== "undefined" ? document.title : "",
  );
  const flashIntervalRef = useRef<number | null>(null);

  const stopFlash = useCallback(() => {
    if (flashIntervalRef.current !== null) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
      document.title = originalTitleRef.current;
    }
  }, []);

  // Restore the title as soon as the player returns to the tab, and clean up
  // any running flash when the component using this hook unmounts.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") stopFlash();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopFlash();
    };
  }, [stopFlash]);

  const notify = useCallback((message: string) => {
    try {
      navigator.vibrate?.([120, 60, 120]);
    } catch {
      /* vibration unsupported — ignore */
    }

    // Only flash the title when the page isn't in focus; if the player is
    // already looking at it, the toast alone is enough.
    if (document.visibilityState === "hidden") {
      if (flashIntervalRef.current === null) {
        // Starting fresh — remember the real title to restore later.
        originalTitleRef.current = document.title;
      } else {
        clearInterval(flashIntervalRef.current);
      }
      const flashTitle = `🔔 ${message}`;
      let showFlash = true;
      document.title = flashTitle;
      flashIntervalRef.current = window.setInterval(() => {
        showFlash = !showFlash;
        document.title = showFlash ? flashTitle : originalTitleRef.current;
      }, 1200);
    }
  }, []);

  return { notify };
}
