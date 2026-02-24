-- Add is_public flag to tournaments table
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow anyone (including unauthenticated anon users) to read public tournaments
CREATE POLICY "tournaments_select_public"
  ON public.tournaments
  FOR SELECT
  USING (is_public = true);

-- Allow anyone to read players in public tournaments
CREATE POLICY "tournament_players_select_public"
  ON public.tournament_players
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_players.tournament_id
        AND t.is_public = true
    )
  );

-- Allow anyone to read matches in public tournaments
CREATE POLICY "tournament_matches_select_public"
  ON public.tournament_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND t.is_public = true
    )
  );
