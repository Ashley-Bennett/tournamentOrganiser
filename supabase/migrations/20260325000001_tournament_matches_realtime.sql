DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tournament_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;
  END IF;
END;
$$;
