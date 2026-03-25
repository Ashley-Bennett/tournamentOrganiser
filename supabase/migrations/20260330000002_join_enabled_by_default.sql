-- Self-registration is now always on by default for new tournaments.
-- 1. Change the column default to true
ALTER TABLE tournaments ALTER COLUMN join_enabled SET DEFAULT true;

-- 2. Trigger: auto-generate a join_code when a new tournament is created
CREATE OR REPLACE FUNCTION trg_tournaments_auto_join_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := generate_join_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tournaments_auto_join_code
  BEFORE INSERT ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION trg_tournaments_auto_join_code();

-- 3. Backfill: enable join and assign codes to draft tournaments that don't have one
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM tournaments WHERE status = 'draft' AND join_code IS NULL
  LOOP
    UPDATE tournaments
    SET join_enabled = true, join_code = generate_join_code()
    WHERE id = r.id;
  END LOOP;

  -- Also enable join for any draft tournaments that have a code but aren't enabled
  UPDATE tournaments
  SET join_enabled = true
  WHERE status = 'draft' AND join_code IS NOT NULL AND join_enabled = false;
END;
$$;
