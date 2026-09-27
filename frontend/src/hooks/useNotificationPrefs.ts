import { useEffect, useState } from "react";
import {
  getPrefs,
  setPrefs,
  subscribePrefs,
  type NotificationPrefs,
} from "../utils/notificationPrefs";

/** The device's notification preferences, re-rendering on change from any tab. */
export function useNotificationPrefs() {
  const [prefs, setState] = useState<NotificationPrefs>(() => getPrefs());

  useEffect(() => subscribePrefs(() => setState(getPrefs())), []);

  return { prefs, setPrefs };
}
