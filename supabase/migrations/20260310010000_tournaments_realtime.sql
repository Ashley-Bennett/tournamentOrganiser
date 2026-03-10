-- Enable full replica identity on tournaments so that realtime payloads include
-- all column values (not just changed ones). Required for the timer pause/resume
-- subscription in TournamentPairings to receive current_round_started_at,
-- round_elapsed_seconds, and round_is_paused in payload.new.
ALTER TABLE tournaments REPLICA IDENTITY FULL;

-- Add tournaments to the realtime publication if it lists tables explicitly.
-- This is a no-op on projects that use FOR ALL TABLES.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tournaments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
  END IF;
END;
$$;
