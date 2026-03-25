-- Enable realtime on match_result_reports so the organiser sees player submissions live.
ALTER TABLE match_result_reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'match_result_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE match_result_reports;
  END IF;
END;
$$;
