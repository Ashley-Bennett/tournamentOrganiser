-- 1. Auto-link player entry to auth user when joining while authenticated.
--    self_join_tournament now sets user_id = auth.uid() if the caller is logged in.
--    Anonymous joins are unaffected (user_id stays NULL).

CREATE OR REPLACE FUNCTION public.self_join_tournament(
  p_tournament_id UUID,
  p_player_name   TEXT,
  p_device_id     TEXT DEFAULT NULL
)
RETURNS TABLE(player_id UUID, device_token TEXT, tournament_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id    UUID;
  v_status          TEXT;
  v_join_enabled    BOOLEAN;
  v_tournament_name TEXT;
  v_player_id       UUID;
  v_device_token    TEXT;
  v_trimmed_name    TEXT;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  IF length(v_trimmed_name) > 50 THEN
    RAISE EXCEPTION 'Player name is too long (max 50 characters)';
  END IF;

  SELECT t.workspace_id, t.status, t.join_enabled, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT v_join_enabled THEN
    RAISE EXCEPTION 'Registration is not open for this tournament';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND lower(name) = lower(v_trimmed_name)
  ) THEN
    RAISE EXCEPTION 'A player with that name is already registered';
  END IF;

  v_device_token := replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.tournament_players (
    tournament_id, workspace_id, name, device_token, device_id, user_id
  )
  VALUES (
    p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    auth.uid()  -- NULL for anonymous, user id for authenticated
  )
  RETURNING id INTO v_player_id;

  RETURN QUERY SELECT v_player_id, v_device_token, v_tournament_name::TEXT;
END;
$$;


-- 2. Extend get_my_player_entries to return per-tournament match stats
--    (match_wins, total_matches) so the dashboard can show a game-level win rate.
--    DROP first because we're changing the return type.

DROP FUNCTION IF EXISTS public.get_my_player_entries();

CREATE FUNCTION public.get_my_player_entries()
RETURNS TABLE(
  tournament_player_id UUID,
  tournament_id        UUID,
  tournament_name      TEXT,
  tournament_status    TEXT,
  workspace_id         UUID,
  workspace_name       TEXT,
  workspace_slug       TEXT,
  player_name          TEXT,
  joined_at            TIMESTAMPTZ,
  player_position      INT,
  total_players        INT,
  match_wins           INT,
  total_matches        INT,
  deck_pokemon1        INT,
  deck_pokemon2        INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH my_tournament_ids AS (
    SELECT DISTINCT tp.tournament_id
    FROM public.tournament_players tp
    WHERE tp.user_id = auth.uid()
  ),
  player_stats AS (
    SELECT
      tp.tournament_id,
      tp.id AS player_id,
      COALESCE(SUM(
        CASE
          WHEN tm.status = 'bye'                                                          THEN 3
          WHEN tm.player2_id IS NULL AND tm.result = 'loss' AND tm.status = 'completed'  THEN 0
          WHEN tm.status = 'completed' AND tm.winner_id = tp.id                          THEN 3
          WHEN tm.status = 'completed' AND tm.winner_id IS NULL                          THEN 1
          WHEN tm.status = 'completed'                                                    THEN 0
          ELSE 0
        END
      ), 0) AS match_points,
      COUNT(CASE WHEN tm.status = 'completed' AND tm.player2_id IS NOT NULL THEN 1 END)::INT       AS total_matches,
      COUNT(CASE WHEN tm.status = 'completed' AND tm.player2_id IS NOT NULL AND tm.winner_id = tp.id THEN 1 END)::INT AS match_wins
    FROM public.tournament_players tp
    JOIN my_tournament_ids mti ON mti.tournament_id = tp.tournament_id
    LEFT JOIN public.tournament_matches tm
      ON  tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    GROUP BY tp.tournament_id, tp.id
  ),
  ranked AS (
    SELECT
      ps.tournament_id,
      ps.player_id,
      ps.match_wins,
      ps.total_matches,
      RANK()   OVER (PARTITION BY ps.tournament_id ORDER BY ps.match_points DESC)::INT AS position,
      COUNT(*) OVER (PARTITION BY ps.tournament_id)::INT                               AS total_players
    FROM player_stats ps
  )
  SELECT
    tp.id::UUID        AS tournament_player_id,
    t.id::UUID         AS tournament_id,
    t.name::TEXT       AS tournament_name,
    t.status::TEXT     AS tournament_status,
    w.id::UUID         AS workspace_id,
    w.name::TEXT       AS workspace_name,
    w.slug::TEXT       AS workspace_slug,
    tp.name::TEXT      AS player_name,
    tp.created_at      AS joined_at,
    CASE WHEN t.status = 'completed' THEN r.position      ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN r.total_players ELSE NULL END AS total_players,
    COALESCE(r.match_wins, 0)    AS match_wins,
    COALESCE(r.total_matches, 0) AS total_matches,
    tp.deck_pokemon1   AS deck_pokemon1,
    tp.deck_pokemon2   AS deck_pokemon2
  FROM public.tournament_players tp
  JOIN public.tournaments t  ON t.id = tp.tournament_id
  JOIN public.workspaces  w  ON w.id = t.workspace_id
  LEFT JOIN ranked        r  ON r.tournament_id = tp.tournament_id AND r.player_id = tp.id
  WHERE tp.user_id = auth.uid()
  ORDER BY tp.created_at DESC;
END;
$$;
