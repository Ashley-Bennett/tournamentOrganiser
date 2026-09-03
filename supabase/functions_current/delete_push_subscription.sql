CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
END;
$function$
