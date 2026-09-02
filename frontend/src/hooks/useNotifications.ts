import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearAll as storeClearAll,
  getNotifications,
  markAllRead as storeMarkAllRead,
  markRead as storeMarkRead,
  subscribe,
  type StoredNotification,
} from "../utils/notificationStore";

/**
 * Reads the persisted notification store and re-renders on any change to it —
 * including writes from another tab, which the store surfaces through the
 * `storage` event.
 */
export function useNotifications() {
  const [items, setItems] = useState<StoredNotification[]>(() =>
    getNotifications(),
  );

  useEffect(() => subscribe(() => setItems(getNotifications())), []);

  const unread = useMemo(
    () => items.filter((n) => n.readAt === null).length,
    [items],
  );

  const markRead = useCallback((id: string) => storeMarkRead(id), []);
  const markAllRead = useCallback(() => storeMarkAllRead(), []);
  const clearAll = useCallback(() => storeClearAll(), []);

  return { items, unread, markRead, markAllRead, clearAll };
}

/**
 * Carries the unread count in the browser-tab title, so a player who has
 * switched apps can see there is something waiting without opening MatchAmp.
 *
 * Owns only the "(n) " prefix — the base title is whatever the app set — and
 * strips any existing prefix before re-applying, so counts never stack up.
 */
export function useUnreadTitle(unread: number) {
  const baseRef = useRef<string>("");

  useEffect(() => {
    if (typeof document === "undefined") return;

    const base = document.title.replace(/^\(\d+\)\s/, "");
    baseRef.current = base;
    document.title = unread > 0 ? `(${unread}) ${base}` : base;

    return () => {
      document.title = baseRef.current;
    };
  }, [unread]);
}
