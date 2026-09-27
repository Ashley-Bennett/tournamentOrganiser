import { useState } from "react";
import { Alert, Box, Divider, Stack, Switch, Typography } from "@mui/material";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { useNotificationPrefs } from "../hooks/useNotificationPrefs";

function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Box flexGrow={1}>
        <Typography variant="body1" fontWeight={500}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        inputProps={{ "aria-label": title }}
      />
    </Stack>
  );
}

/**
 * Per-device notification switches: in-app pop-ups, and OS push for this
 * browser. Both live on the device rather than the account — push is a
 * browser subscription, and most players have no account at all.
 */
export default function NotificationSettings() {
  const { prefs, setPrefs } = useNotificationPrefs();
  const {
    supported,
    permission,
    subscribed,
    iosNeedsInstall,
    inApp,
    subscribing,
    subscribeEverywhere,
    unsubscribe,
  } = usePushSubscription();
  const [pushError, setPushError] = useState("");

  const pushOn = !!subscribed && permission === "granted" && prefs.push;

  // Why the push switch can't be used here, if it can't.
  let pushBlocker: string | null = null;
  if (inApp) {
    pushBlocker =
      "Push notifications don't work in this in-app browser. Open MatchAmp in Chrome or Safari to turn them on.";
  } else if (iosNeedsInstall) {
    pushBlocker =
      "On iPhone and iPad, add MatchAmp to your Home Screen (Share → Add to Home Screen) to get push notifications.";
  } else if (!supported) {
    pushBlocker = "This browser doesn't support push notifications.";
  } else if (permission === "denied") {
    pushBlocker =
      "Notifications are blocked for MatchAmp in your browser settings. Allow them there, then come back to turn push on.";
  }

  const togglePush = async (next: boolean) => {
    setPushError("");
    const ok = next ? await subscribeEverywhere() : await unsubscribe();
    if (!ok) {
      setPushError(
        next
          ? "Couldn't turn on push notifications. Check your browser allows them and try again."
          : "Couldn't turn off push notifications. Please try again.",
      );
    }
  };

  return (
    <Stack spacing={2} divider={<Divider flexItem />}>
      <SettingRow
        title="Pop-up alerts"
        description="Show a banner and buzz your phone when something happens while MatchAmp is open. Everything still appears under the bell."
        checked={prefs.popups}
        onChange={(next) => setPrefs({ popups: next })}
      />

      <Stack spacing={1}>
        <SettingRow
          title="Push notifications on this device"
          description="Get told about new pairings, round timers and results even when MatchAmp is closed."
          checked={pushOn}
          disabled={!!pushBlocker || subscribing || subscribed === null}
          onChange={(next) => void togglePush(next)}
        />
        {pushBlocker && (
          <Alert severity="info" variant="outlined">
            {pushBlocker}
          </Alert>
        )}
        {pushError && <Alert severity="error">{pushError}</Alert>}
      </Stack>
    </Stack>
  );
}
