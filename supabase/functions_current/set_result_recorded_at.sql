CREATE OR REPLACE FUNCTION public.set_result_recorded_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
