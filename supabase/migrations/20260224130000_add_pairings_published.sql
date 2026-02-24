ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS pairings_published BOOLEAN NOT NULL DEFAULT FALSE;
