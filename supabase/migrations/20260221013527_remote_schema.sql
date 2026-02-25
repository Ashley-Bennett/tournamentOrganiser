-- ============================================================
-- Base schema — applied directly to remote on initial setup.
-- Reproduced here so local `supabase db reset` can build the
-- full schema from migrations alone (seed.sql is data-only).
-- ============================================================

-- tournaments
CREATE TABLE IF NOT EXISTS public.tournaments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'completed')),
  tournament_type TEXT        NOT NULL DEFAULT 'single_elimination'
                    CHECK (tournament_type IN ('swiss', 'single_elimination')),
  num_rounds      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_insert_own" ON public.tournaments
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "tournaments_select_own" ON public.tournaments
  FOR SELECT USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "tournaments_update_own" ON public.tournaments
  FOR UPDATE
  USING ((SELECT auth.uid()) = created_by)
  WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "tournaments_delete_own" ON public.tournaments
  FOR DELETE USING ((SELECT auth.uid()) = created_by);

-- tournament_players
CREATE TABLE IF NOT EXISTS public.tournament_players (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  created_by       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  dropped              BOOLEAN     NOT NULL DEFAULT false,
  dropped_at_round     INTEGER,
  has_static_seating   BOOLEAN     NOT NULL DEFAULT false,
  static_seat_number   INTEGER
);

ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_players_insert_own" ON public.tournament_players
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "tournament_players_select_own" ON public.tournament_players
  FOR SELECT USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "tournament_players_update_own" ON public.tournament_players
  FOR UPDATE
  USING ((SELECT auth.uid()) = created_by)
  WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "tournament_players_delete_own" ON public.tournament_players
  FOR DELETE USING (
    (SELECT auth.uid()) = created_by
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_players.tournament_id AND t.status = 'draft'
    )
  );

-- tournament_matches
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id        UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number         INTEGER     NOT NULL,
  player1_id           UUID        NOT NULL REFERENCES public.tournament_players(id) ON DELETE CASCADE,
  player2_id           UUID        REFERENCES public.tournament_players(id) ON DELETE SET NULL,
  winner_id            UUID        REFERENCES public.tournament_players(id) ON DELETE SET NULL,
  result               TEXT,
  temp_winner_id       UUID        REFERENCES public.tournament_players(id) ON DELETE SET NULL,
  temp_result          TEXT,
  match_number         INTEGER,
  status               TEXT        NOT NULL DEFAULT 'ready'
                         CHECK (status IN ('ready', 'pending', 'completed', 'bye')),
  pairing_decision_log JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_matches_select_own" ON public.tournament_matches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_matches.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

CREATE POLICY "tournament_matches_insert_own" ON public.tournament_matches
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_matches.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

CREATE POLICY "tournament_matches_update_own" ON public.tournament_matches
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_matches.tournament_id AND t.created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_matches.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

CREATE POLICY "tournament_matches_delete_own" ON public.tournament_matches
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_matches.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

-- Pairing integrity indexes
CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_unique_pair_per_round
  ON public.tournament_matches (
    tournament_id, round_number,
    LEAST(player1_id, player2_id), GREATEST(player1_id, player2_id)
  ) WHERE player2_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_unique_player1_per_round
  ON public.tournament_matches (tournament_id, round_number, player1_id);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_unique_player2_per_round
  ON public.tournament_matches (tournament_id, round_number, player2_id)
  WHERE player2_id IS NOT NULL;

-- tournament_standings
CREATE TABLE IF NOT EXISTS public.tournament_standings (
  tournament_id  UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_id      UUID        NOT NULL REFERENCES public.tournament_players(id) ON DELETE CASCADE,
  match_points   INTEGER     NOT NULL DEFAULT 0,
  wins           INTEGER     NOT NULL DEFAULT 0,
  losses         INTEGER     NOT NULL DEFAULT 0,
  draws          INTEGER     NOT NULL DEFAULT 0,
  matches_played INTEGER     NOT NULL DEFAULT 0,
  byes_received  INTEGER     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id)
);

ALTER TABLE public.tournament_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_standings_select_own" ON public.tournament_standings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_standings.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

CREATE POLICY "tournament_standings_insert_own" ON public.tournament_standings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_standings.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

CREATE POLICY "tournament_standings_update_own" ON public.tournament_standings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_standings.tournament_id AND t.created_by = (SELECT auth.uid()))
  );

CREATE POLICY "tournament_standings_delete_own" ON public.tournament_standings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.tournaments t
            WHERE t.id = tournament_standings.tournament_id AND t.created_by = (SELECT auth.uid()))
  );
