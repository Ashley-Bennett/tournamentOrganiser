-- ─────────────────────────────────────────────────────────────────────────────
-- Pin search_path on set_result_recorded_at
--
-- 20260901010900_round_timing_capture created this trigger function without a
-- pinned search_path, which the Supabase `function_search_path_mutable` advisor
-- flags. It is SECURITY INVOKER, so there is no privilege-escalation path here
-- and nothing was exploitable; this closes a convention gap so the function
-- matches every other function in this schema and the advisor stays quiet.
--
-- Body is unchanged from 20260901010900. CREATE OR REPLACE preserves the
-- function's oid, so trg_set_result_recorded_at on tournament_matches keeps
-- pointing at it and does not need recreating.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_result_recorded_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Byes are deliberately excluded: nobody played, so a duration would be
  -- meaningless and would drag every average down.
  IF NEW.status = 'completed'
     AND NEW.result_recorded_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
  THEN
    NEW.result_recorded_at := now();
  END IF;
  RETURN NEW;
END;
$$;
