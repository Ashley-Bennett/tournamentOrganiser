import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import TimerIcon from "@mui/icons-material/Timer";

interface RoundTimerProps {
  startedAt: string; // ISO timestamp from current_round_started_at
  durationMinutes: number;
  size?: "small" | "large";
}

// Formats a remaining-time value (may be negative for overtime).
// Negative values are shown with a leading "-".
function formatTime(remainingMs: number): string {
  const isNegative = remainingMs < 0;
  const abs = Math.abs(remainingMs);
  const mins = Math.floor(abs / 60_000);
  const secs = Math.floor((abs % 60_000) / 1_000);
  const hhmm = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return isNegative ? `-${hhmm}` : hhmm;
}

export default function RoundTimer({
  startedAt,
  durationMinutes,
  size = "small",
}: RoundTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Poll at 250 ms so we never visually skip a second even if a tick fires slightly late.
    // The displayed value is always derived from the absolute wall-clock difference,
    // so accuracy is unaffected by the polling interval.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsedMs = now - new Date(startedAt).getTime();
  const remainingMs = durationMinutes * 60_000 - elapsedMs;
  const isOvertime = remainingMs < 0;
  const isRed = remainingMs <= 5 * 60_000; // red at ≤5 min remaining
  const colour = isRed ? "error.main" : "text.primary";
  const timeStr = formatTime(remainingMs);

  if (size === "large") {
    return (
      <Box
        sx={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          p: 2,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            color: colour,
            fontWeight: 700,
            letterSpacing: 3,
            fontSize: "1rem",
          }}
        >
          {isOvertime ? "OVERTIME" : "Time Remaining"}
        </Typography>
        <Typography
          component="div"
          sx={{
            fontFamily: "monospace",
            // Panel is ~50vw. Worst case is 6 chars (-MM:SS); monospace chars are
            // ~0.6em wide, so 6 × 0.6 × 12vw = 43vw — fits safely inside 50vw.
            // min(12vw, 22vh) also prevents overflow on short/landscape screens.
            fontSize: "min(12vw, 22vh)",
            fontWeight: 700,
            color: colour,
            lineHeight: 1,
          }}
        >
          {timeStr}
        </Typography>
      </Box>
    );
  }

  // Small inline variant
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        color: colour,
      }}
    >
      <TimerIcon sx={{ fontSize: "1rem" }} />
      <Typography
        variant="body2"
        sx={{ fontFamily: "monospace", fontWeight: 600, color: colour }}
      >
        {isOvertime ? `OVERTIME ${timeStr}` : timeStr}
      </Typography>
    </Box>
  );
}
