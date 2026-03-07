-- Add late entry tracking to tournament_players
-- is_late_entry: true when the player was added after the tournament started
-- late_entry_round: the round number that was active (or just completed) when they joined
ALTER TABLE public.tournament_players
  ADD COLUMN is_late_entry BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN late_entry_round INTEGER;
