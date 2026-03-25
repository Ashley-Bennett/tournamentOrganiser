-- match_result_reports had RLS enabled with no SELECT policy, causing Supabase
-- realtime to silently drop change events for authenticated users (the organiser).
-- Add a SELECT policy so realtime events reach the organiser's subscription.
-- Actual data is still only accessible through the get_match_result_reports
-- SECURITY DEFINER RPC, which enforces workspace-member authorisation.

CREATE POLICY "authenticated users can select match reports"
  ON public.match_result_reports
  FOR SELECT
  TO authenticated
  USING (true);
