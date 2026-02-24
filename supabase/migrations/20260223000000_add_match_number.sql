-- Add match_number column to tournament_matches
-- match_number = table number: 1 is the top-rated pairing, assigned at pairing creation time
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS match_number integer;
