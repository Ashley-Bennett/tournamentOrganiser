CREATE OR REPLACE FUNCTION public.trg_tournaments_auto_join_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := public.generate_join_code(NEW.game_id);
  END IF;
  RETURN NEW;
END;
$function$
