CREATE OR REPLACE FUNCTION public.cleanup_match_reports_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    DELETE FROM public.match_result_reports WHERE match_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
