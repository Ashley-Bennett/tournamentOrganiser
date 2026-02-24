-- Add static seating fields to tournament_players
-- has_static_seating: marks a player as needing a fixed physical seat (even without a specific number)
-- static_seat_number: when set, forces this player's match to always use this table/match number
ALTER TABLE public.tournament_players
  ADD COLUMN IF NOT EXISTS has_static_seating BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS static_seat_number INTEGER;
