import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import TimerIcon from "@mui/icons-material/Timer";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";

interface RoundTimerProps {
  /** ISO timestamp from current_round_started_at (null when paused) */
  startedAt: string | null;
  durationMinutes: number;
  /** Accumulated elapsed seconds before the current segment (from round_elapsed_seconds) */
  elapsedSeconds?: number;
  /** Whether the timer is currently paused */
  isPaused?: boolean;
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
  elapsedSeconds = 0,
  isPaused = false,
  size = "small",
}: RoundTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isPaused) return; // no tick while paused
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [isPaused]);

  // Total elapsed ms: base offset + live segment (0 when paused since startedAt is null)
  const baseMs = elapsedSeconds * 1_000;
  const liveMs =
    !isPaused && startedAt ? now - new Date(startedAt).getTime() : 0;
  const totalElapsedMs = baseMs + liveMs;

  const remainingMs = durationMinutes * 60_000 - totalElapsedMs;
  const isOvertime = remainingMs < 0;
  const isRed = !isPaused && remainingMs <= 5 * 60_000;
  const colour = isPaused ? "warning.main" : isRed ? "error.main" : "text.primary";
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
          {isPaused ? "PAUSED" : isOvertime ? "OVERTIME" : "Time Remaining"}
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
      {isPaused ? (
        <PauseCircleIcon sx={{ fontSize: "1rem" }} />
      ) : (
        <TimerIcon sx={{ fontSize: "1rem" }} />
      )}
      <Typography
        variant="body2"
        sx={{ fontFamily: "monospace", fontWeight: 600, color: colour }}
      >
        {isPaused
          ? `PAUSED ${timeStr}`
          : isOvertime
            ? `OVERTIME ${timeStr}`
            : timeStr}
      </Typography>
    </Box>
  );
}
