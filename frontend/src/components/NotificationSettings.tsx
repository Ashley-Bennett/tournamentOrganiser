import { useState } from "react";
import { Alert, Box, Button, Divider, Stack, Switch, Typography } from "@mui/material";
import CopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { blockedNotificationHelp } from "../utils/notificationHelp";
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
 * Notifications were refused, and a page can neither re-ask nor open the
 * browser's settings — so spell out where the switch is in this browser.
 */
function BlockedHelpAlert({ standalone }: { standalone: boolean }) {
  const help = blockedNotificationHelp(
    navigator.userAgent,
    window.location.origin,
    standalone,
  );
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!help.settingsUrl) return;
    try {
      await navigator.clipboard.writeText(help.settingsUrl);
      setCopied(true);
    } catch {
      // Clipboard refused — the steps above still get them there.
    }
  };

  return (
    <Alert severity="info" variant="outlined">
      <Typography variant="body2" fontWeight={600} mb={0.5}>
        Notifications are blocked for MatchAmp. To allow them in {help.browser}:
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        {help.steps.map((step) => (
          <Typography component="li" variant="body2" key={step}>
            {step}
          </Typography>
        ))}
      </Box>
      {help.settingsUrl && (
        <Box mt={1.5}>
          <Typography variant="body2" color="text.secondary" mb={0.5}>
            Or go straight there: copy this address and paste it into a new tab.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={copied ? <CheckIcon /> : <CopyIcon />}
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy settings address"}
          </Button>
        </Box>
      )}
    </Alert>
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
    standalone,
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
  }
  const blocked = !pushBlocker && permission === "denied";

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
          disabled={!!pushBlocker || blocked || subscribing || subscribed === null}
          onChange={(next) => void togglePush(next)}
        />
        {pushBlocker && (
          <Alert severity="info" variant="outlined">
            {pushBlocker}
          </Alert>
        )}
        {blocked && <BlockedHelpAlert standalone={standalone} />}
        {pushError && <Alert severity="error">{pushError}</Alert>}
      </Stack>
    </Stack>
  );
}
