-- Add a free-text note field that the organiser can set during an active round.
-- Displayed to players on the pairings page as an announcement / flavour text.
ALTER TABLE tournaments ADD COLUMN round_note TEXT;
