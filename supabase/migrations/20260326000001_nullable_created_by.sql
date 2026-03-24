-- Self-registered players have no authenticated user, so created_by must be nullable.
ALTER TABLE public.tournament_players
  ALTER COLUMN created_by DROP NOT NULL;
