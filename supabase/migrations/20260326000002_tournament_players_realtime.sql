-- Enable realtime on tournament_players so the organiser sees self-registrations live.
ALTER TABLE tournament_players REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tournament_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_players;
  END IF;
END;
$$;
