-- Round timer: how long each round should last (null = no timer configured)
ALTER TABLE tournaments ADD COLUMN round_duration_minutes INTEGER;

-- Absolute timestamp set by the server when "Begin Round" is pressed.
-- Cleared to null when the round advances or the tournament completes.
-- Both pages (matches + pairings) compute remaining time as:
--   remaining = round_duration_minutes * 60 - (now - current_round_started_at)
ALTER TABLE tournaments ADD COLUMN current_round_started_at TIMESTAMPTZ;
