-- Fix: match_insights.player_id is auth.users.id, not tournament_players.id.
-- Both stats RPCs were joining on the wrong column, causing insights to be silently ignored.

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_matchup_matrix
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_matchup_matrix(
  p_deck_pokemon1 INT DEFAULT NULL,
  p_deck_pokemon2 INT DEFAULT NULL
)
RETURNS TABLE(
  opp_pokemon1   INT,
  opp_pokemon2   INT,
  matches_played INT,
  wins           INT,
  losses         INT,
  draws          INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
  ),
  my_matches AS (
    SELECT
      tm.id                                                                   AS match_id,
      me.player_id                                                            AS my_player_id,
      me.deck_pokemon1                                                        AS my_p1,
      me.deck_pokemon2                                                        AS my_p2,
      CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id
           ELSE tm.player1_id END                                             AS opp_player_id,
      tm.winner_id,
      tm.tournament_id
    FROM public.tournament_matches tm
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
      AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
      AND (p_deck_pokemon1 IS NULL OR (
        me.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
        AND me.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
      ))
  ),
  -- Resolve opponent deck: prefer match_insights (player-reported), fall back to tournament_players.
  -- match_insights.player_id is auth.users.id (v_uid), not tournament_players.id.
  with_opp_deck AS (
    SELECT
      mm.match_id,
      mm.my_player_id,
      mm.winner_id,
      COALESCE(mi.opponent_deck_pokemon1, opp_tp.deck_pokemon1) AS opp_p1,
      COALESCE(mi.opponent_deck_pokemon2, opp_tp.deck_pokemon2) AS opp_p2
    FROM my_matches mm
    LEFT JOIN public.tournament_players opp_tp
      ON opp_tp.id = mm.opp_player_id AND opp_tp.tournament_id = mm.tournament_id
    LEFT JOIN public.match_insights mi
      ON mi.match_id = mm.match_id AND mi.player_id = v_uid
  )
  SELECT
    wod.opp_p1 AS opp_pokemon1,
    wod.opp_p2 AS opp_pokemon2,
    COUNT(*)::INT                                              AS matches_played,
    COUNT(*) FILTER (WHERE wod.winner_id = wod.my_player_id)::INT AS wins,
    COUNT(*) FILTER (WHERE wod.winner_id IS NOT NULL
                       AND wod.winner_id != wod.my_player_id)::INT AS losses,
    COUNT(*) FILTER (WHERE wod.winner_id IS NULL)::INT         AS draws
  FROM with_opp_deck wod
  WHERE wod.opp_p1 IS NOT NULL OR wod.opp_p2 IS NOT NULL
  GROUP BY wod.opp_p1, wod.opp_p2
  ORDER BY matches_played DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_player_first_second_stats
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_first_second_stats(
  p_deck_pokemon1 INT DEFAULT NULL,
  p_deck_pokemon2 INT DEFAULT NULL
)
RETURNS TABLE(
  went_first_wins  INT,
  went_first_total INT,
  went_second_wins INT,
  went_second_total INT,
  insights_count   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2
    FROM public.tournament_players tp
    WHERE tp.user_id = v_uid
  ),
  insights_with_outcome AS (
    SELECT
      mi.went_first,
      CASE
        WHEN tm.winner_id = me.player_id THEN 'win'
        WHEN tm.winner_id IS NULL THEN 'draw'
        ELSE 'loss'
      END AS outcome
    FROM public.match_insights mi
    JOIN public.tournament_matches tm ON tm.id = mi.match_id
    -- Join on tournament to get the deck; match_insights.player_id = auth.users.id (v_uid)
    JOIN my_entries me ON me.tournament_id = tm.tournament_id
    WHERE mi.player_id = v_uid
      AND mi.went_first IS NOT NULL
      AND tm.status = 'completed'
      AND tm.player2_id IS NOT NULL
      AND (p_deck_pokemon1 IS NULL OR (
        me.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
        AND me.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
      ))
  )
  SELECT
    COUNT(*) FILTER (WHERE went_first = TRUE  AND outcome = 'win')::INT  AS went_first_wins,
    COUNT(*) FILTER (WHERE went_first = TRUE)::INT                        AS went_first_total,
    COUNT(*) FILTER (WHERE went_first = FALSE AND outcome = 'win')::INT  AS went_second_wins,
    COUNT(*) FILTER (WHERE went_first = FALSE)::INT                       AS went_second_total,
    COUNT(*)::INT                                                          AS insights_count
  FROM insights_with_outcome;
END;
$$;
