import { useState } from "react";
import { Alert, Button, Box } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { usePushSubscription } from "../hooks/usePushSubscription";

interface Props {
  variant: "player" | "organiser";
  tournamentId: string;
  /** Required for the player variant */
  playerId?: string;
  deviceToken?: string;
}

const dismissKey = (variant: string, tournamentId: string) =>
  `push_optin_dismissed_${variant}_${tournamentId}`;

/**
 * Soft opt-in for Web Push (Phase 2). Shown once per tournament; only calls the
 * native permission prompt when the user taps Enable, avoiding permanent
 * denials. Renders nothing when push is unsupported, already granted, blocked,
 * or previously dismissed. On iOS Safari (not installed) it nudges the user to
 * add the app to the Home Screen instead, since iOS push requires that.
 */
export default function PushOptIn({
  variant,
  tournamentId,
  playerId,
  deviceToken,
}: Props) {
  const {
    supported,
    permission,
    iosNeedsInstall,
    subscribing,
    subscribeAsPlayer,
    subscribeAsOrganiser,
  } = usePushSubscription();

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissKey(variant, tournamentId)) === "1",
  );
  const [done, setDone] = useState(false);

  if (!supported || permission !== "default" || dismissed || done) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey(variant, tournamentId), "1");
    setDismissed(true);
  };

  // iOS: can't subscribe until installed — guide instead of prompting.
  if (iosNeedsInstall) {
    return (
      <Alert
        severity="info"
        icon={<NotificationsActiveIcon fontSize="inherit" />}
        onClose={dismiss}
        sx={{ mb: 2 }}
      >
        Add Matchamp to your Home Screen (Share → Add to Home Screen) to get
        notified about pairings and results.
      </Alert>
    );
  }

  const handleEnable = async () => {
    const ok =
      variant === "player"
        ? playerId && deviceToken
          ? await subscribeAsPlayer(playerId, deviceToken)
          : false
        : await subscribeAsOrganiser(tournamentId);
    if (ok) setDone(true);
    else dismiss(); // permission denied or failed — don't nag again
  };

  const message =
    variant === "player"
      ? "Get notified when your next pairing is ready."
      : "Get alerted when a round timer runs out.";

  return (
    <Alert
      severity="info"
      icon={<NotificationsActiveIcon fontSize="inherit" />}
      sx={{ mb: 2, alignItems: "center" }}
      action={
        <Box display="flex" gap={0.5} alignItems="center">
          <Button
            color="inherit"
            size="small"
            variant="outlined"
            disabled={subscribing}
            onClick={() => void handleEnable()}
          >
            {subscribing ? "Enabling…" : "Enable"}
          </Button>
          <Button color="inherit" size="small" onClick={dismiss}>
            Not now
          </Button>
        </Box>
      }
    >
      {message}
    </Alert>
  );
}
