import { useCallback, useState } from "react";
import { supabase } from "../supabaseClient";

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

  const standalone =
    typeof window !== "undefined" ? detectStandalone() : false;
  // iOS delivers web push only from an installed PWA.
  const iosNeedsInstall =
    typeof window !== "undefined" &&
    isIos() &&
    !standalone &&
    "serviceWorker" in navigator;

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
    return {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    };
  }, [supported]);

  const subscribeAsPlayer = useCallback(
    async (playerId: string, deviceToken: string): Promise<boolean> => {
      setSubscribing(true);
      try {
        const s = await doSubscribe();
        if (!s) return false;
        const { error } = await supabase.rpc("save_push_subscription", {
          p_endpoint: s.endpoint,
          p_p256dh: s.p256dh,
          p_auth: s.auth,
          p_tournament_player_id: playerId,
          p_device_token: deviceToken,
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

  return {
    supported,
    permission,
    standalone,
    iosNeedsInstall,
    subscribing,
    subscribeAsPlayer,
    subscribeAsOrganiser,
  };
}
