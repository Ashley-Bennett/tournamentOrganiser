CREATE OR REPLACE FUNCTION public.set_result_recorded_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Byes are deliberately excluded: nobody played, so a duration would be
  -- meaningless and would drag every average down.
  IF NEW.status = 'completed' THEN
    IF NEW.result_recorded_at IS NULL
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
    THEN
      NEW.result_recorded_at := now();
    END IF;
  ELSIF NEW.temp_result IS NOT NULL THEN
    -- A player reported, or the desk entered, a result: the game is over.
    IF NEW.result_recorded_at IS NULL THEN
      NEW.result_recorded_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.temp_result IS NOT NULL THEN
    -- Pending result withdrawn before it was confirmed.
    NEW.result_recorded_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
