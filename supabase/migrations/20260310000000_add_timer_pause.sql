-- Add pause support to the round timer.
--
-- round_elapsed_seconds: accumulated elapsed seconds before the current segment
--   started (0 on a fresh round, updated on pause so the display freezes correctly).
-- round_is_paused: true when the timer is frozen by the organiser.
--
-- Calculation when running:  elapsed = round_elapsed_seconds + (now - current_round_started_at)
-- Calculation when paused:   elapsed = round_elapsed_seconds  (no live tick)

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS round_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_is_paused BOOLEAN NOT NULL DEFAULT FALSE;
