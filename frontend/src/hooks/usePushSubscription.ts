import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { nullableArg } from "../utils/rpcArgs";
import { getAllEntries } from "../utils/playerStorage";
import { setPrefs } from "../utils/notificationPrefs";

// VAPID public key (base64url) — safe to expose to the client.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function detectStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

// Heuristic: are we inside an embedded/in-app browser (email/social webview)?
// Web push can't be enabled reliably there, and never carries to the user's
// real browser — so we steer them out rather than offer a dead "Enable".
function isInAppBrowser(): boolean {
  const ua = window.navigator.userAgent || "";
  if (/(FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|Snapchat|WhatsApp|MicroMessenger|GSA\/)/i.test(ua))
    return true;
  if (/; wv\)/.test(ua) || /\bwv\b/.test(ua)) return true; // Android WebView
  // iOS WKWebView: iOS, not standalone, and missing the Safari token.
  const standalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (isIos() && !standalone && !/Safari/.test(ua)) return true;
  return false;
}

interface Keys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Web Push subscription (Phase 2). Registers the service worker, requests
 * permission, subscribes via the Push API, and records the subscription
 * server-side via the save_push_subscription / link_organiser_push RPCs.
 *
 * Degrades gracefully: `supported` is false where the platform can't do web
 * push (or no VAPID key is configured), and `iosNeedsInstall` flags iOS Safari
 * that must be installed to the Home Screen first.
 */
export function usePushSubscription() {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY;

  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );
  const [subscribing, setSubscribing] = useState(false);
  /** Whether this browser currently holds a push subscription; null until checked. */
  const [subscribed, setSubscribed] = useState<boolean | null>(
    supported ? null : false,
  );

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => {
        if (!cancelled) setSubscribed(!!sub);
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const standalone =
    typeof window !== "undefined" ? detectStandalone() : false;
  // iOS delivers web push only from an installed PWA.
  const iosNeedsInstall =
    typeof window !== "undefined" &&
    isIos() &&
    !standalone &&
    "serviceWorker" in navigator;
  const inApp = typeof window !== "undefined" && isInAppBrowser();

  const doSubscribe = useCallback(async (): Promise<Keys | null> => {
    if (!supported) return null;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return null;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
    setSubscribed(true);
    setPrefs({ push: true });
    return {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    };
  }, [supported]);

  const subscribeAsPlayer = useCallback(
    async (playerId: string, deviceToken: string | null): Promise<boolean> => {
      setSubscribing(true);
      try {
        const s = await doSubscribe();
        if (!s) return false;
        const { error } = await supabase.rpc("save_push_subscription", {
          p_endpoint: s.endpoint,
          p_p256dh: s.p256dh,
          p_auth: s.auth,
          p_tournament_player_id: playerId,
          p_device_token: nullableArg(deviceToken),
        });
        return !error;
      } catch {
        return false;
      } finally {
        setSubscribing(false);
      }
    },
    [doSubscribe],
  );

  const subscribeAsOrganiser = useCallback(
    async (tournamentId: string): Promise<boolean> => {
      setSubscribing(true);
      try {
        const s = await doSubscribe();
        if (!s) return false;
        const { error } = await supabase.rpc("link_organiser_push", {
          p_endpoint: s.endpoint,
          p_p256dh: s.p256dh,
          p_auth: s.auth,
          p_tournament_id: tournamentId,
        });
        return !error;
      } catch {
        return false;
      } finally {
        setSubscribing(false);
      }
    },
    [doSubscribe],
  );

  /**
   * Turns push on from the account page rather than from a tournament: links
   * this browser to every tournament it follows — each one joined on this
   * device, plus every active event the signed-in user helps run.
   */
  const subscribeEverywhere = useCallback(async (): Promise<boolean> => {
    setSubscribing(true);
    try {
      const s = await doSubscribe();
      if (!s) return false;
      const keys = { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth };

      // One bad link (a stale entry, a tournament since removed) must not stop
      // the rest, so each is attempted and failures are ignored.
      const links: PromiseLike<unknown>[] = getAllEntries().map((e) =>
        supabase.rpc("save_push_subscription", {
          ...keys,
          p_tournament_player_id: e.playerId,
          p_device_token: nullableArg(e.deviceToken),
        }),
      );

      const { data: auth } = await supabase.auth.getSession();
      if (auth.session) {
        const { data } = await supabase.rpc("get_organiser_alert_state");
        for (const row of (data ?? []) as { tournament_id: string }[]) {
          links.push(
            supabase.rpc("link_organiser_push", {
              ...keys,
              p_tournament_id: row.tournament_id,
            }),
          );
        }
      }

      await Promise.allSettled(links);
      return true;
    } catch {
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [doSubscribe]);

  /**
   * Stops push on this device. The browser permission stays granted — a page
   * cannot revoke it — so the opt-out is recorded in the device preferences
   * too, which is what brings the in-app banners back.
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setSubscribing(true);
    try {
      setPrefs({ push: false });
      if (!supported) return true;
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc("delete_push_subscription", {
          p_endpoint: sub.endpoint,
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch {
      return false;
    } finally {
      setSubscribing(false);
    }
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    standalone,
    iosNeedsInstall,
    inApp,
    subscribing,
    subscribeAsPlayer,
    subscribeAsOrganiser,
    subscribeEverywhere,
    unsubscribe,
  };
}
