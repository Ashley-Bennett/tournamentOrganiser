-- Table to store optional post-game insights submitted by players.
-- Records went-first status and player-reported opponent deck per match.
CREATE TABLE IF NOT EXISTS public.match_insights (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id              UUID        NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  player_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  went_first            BOOLEAN,
  opponent_deck_pokemon1 INT,
  opponent_deck_pokemon2 INT,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, player_id)
);

ALTER TABLE public.match_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_insights_own"
  ON public.match_insights
  FOR ALL
  USING  (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- Upsert RPC so the frontend doesn't need to handle INSERT vs UPDATE logic
CREATE OR REPLACE FUNCTION public.upsert_match_insights(
  p_match_id              UUID,
  p_went_first            BOOLEAN,
  p_opp_pokemon1          INT,
  p_opp_pokemon2          INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.match_insights (match_id, player_id, went_first, opponent_deck_pokemon1, opponent_deck_pokemon2)
  VALUES (p_match_id, auth.uid(), p_went_first, p_opp_pokemon1, p_opp_pokemon2)
  ON CONFLICT (match_id, player_id)
  DO UPDATE SET
    went_first             = EXCLUDED.went_first,
    opponent_deck_pokemon1 = EXCLUDED.opponent_deck_pokemon1,
    opponent_deck_pokemon2 = EXCLUDED.opponent_deck_pokemon2,
    submitted_at           = now();
END;
$$;
