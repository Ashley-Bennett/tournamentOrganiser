-- ============================================================
-- Persist final standings (correct placings)
--
-- Player placings were computed in SQL as RANK() OVER (ORDER BY
-- match_points DESC) — match points only, no tiebreakers — so
-- everyone tied on record shared a rank (a true 5th showed as 3rd).
-- The app's live standings are correct because they apply the
-- Play! Pokémon OMW%/OOMW%/head-to-head tiebreakers in TypeScript
-- (sortByTieBreakers), which is impractical to reproduce faithfully
-- in SQL.
--
-- Fix: when a tournament completes, the client computes the final
-- order with that same TS code and stores it in tournament_standings
-- (positions are authoritative and match exactly what players saw).
-- The player-facing RPCs now read the stored position instead of
-- recomputing. A one-off backfill populates existing completed
-- tournaments (scripts/backfill-standings.mjs).
--
-- Positions matter only for completed tournaments; if a completed
-- tournament has no stored row yet (pre-backfill), position is NULL
-- and the UI simply omits the placing — never a wrong one.
-- ============================================================

ALTER TABLE public.tournament_standings
  ADD COLUMN IF NOT EXISTS position INTEGER;

-- ---- Write path: store the client-computed final order ------
CREATE OR REPLACE FUNCTION public.save_tournament_standings(
  p_tournament_id UUID,
  p_rows          JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_ws FROM public.tournaments WHERE id = p_tournament_id;
  IF v_ws IS NULL OR NOT public.can_manage_workspace(v_ws) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  DELETE FROM public.tournament_standings WHERE tournament_id = p_tournament_id;

  INSERT INTO public.tournament_standings
    (tournament_id, workspace_id, player_id, position,
     match_points, wins, losses, draws, matches_played, byes_received)
  SELECT
    p_tournament_id, v_ws,
    (r->>'player_id')::UUID,
    (r->>'position')::INT,
    COALESCE((r->>'match_points')::INT, 0),
    COALESCE((r->>'wins')::INT, 0),
    COALESCE((r->>'losses')::INT, 0),
    COALESCE((r->>'draws')::INT, 0),
    COALESCE((r->>'matches_played')::INT, 0),
    COALESCE((r->>'byes_received')::INT, 0)
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_tournament_standings(UUID, JSONB) TO authenticated;

-- ---- Read path: get_my_player_entries reads stored position -
CREATE OR REPLACE FUNCTION public.get_my_player_entries()
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
  -- match_wins / total_matches (byes count as wins) — unchanged.
  wins AS (
    SELECT
      tp.tournament_id,
      tp.id AS player_id,
      COUNT(CASE
        WHEN (tm.status = 'completed' AND tm.player2_id IS NOT NULL) OR tm.status = 'bye' THEN 1
      END)::INT AS total_matches,
      COUNT(CASE
        WHEN (tm.status = 'completed' AND tm.player2_id IS NOT NULL AND tm.winner_id = tp.id)
          OR tm.status = 'bye' THEN 1
      END)::INT AS match_wins
    FROM public.tournament_players tp
    JOIN my_tournament_ids mti ON mti.tournament_id = tp.tournament_id
    LEFT JOIN public.tournament_matches tm
      ON  tm.tournament_id = tp.tournament_id
      AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    GROUP BY tp.tournament_id, tp.id
  ),
  field AS (
    SELECT ts.tournament_id, COUNT(*)::INT AS n
    FROM public.tournament_standings ts
    GROUP BY ts.tournament_id
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
    CASE WHEN t.status = 'completed' THEN ts.position ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN f.n         ELSE NULL END AS total_players,
    COALESCE(wn.match_wins, 0)    AS match_wins,
    COALESCE(wn.total_matches, 0) AS total_matches,
    tp.deck_pokemon1   AS deck_pokemon1,
    tp.deck_pokemon2   AS deck_pokemon2
  FROM public.tournament_players tp
  JOIN public.tournaments t  ON t.id = tp.tournament_id
  JOIN public.workspaces  w  ON w.id = t.workspace_id
  LEFT JOIN public.tournament_standings ts ON ts.tournament_id = tp.tournament_id AND ts.player_id = tp.id
  LEFT JOIN field f  ON f.tournament_id = tp.tournament_id
  LEFT JOIN wins  wn ON wn.tournament_id = tp.tournament_id AND wn.player_id = tp.id
  WHERE tp.user_id = auth.uid()
  ORDER BY tp.created_at DESC;
END;
$$;

-- ---- Read path: get_tournaments_summary reads stored position
CREATE OR REPLACE FUNCTION public.get_tournaments_summary(
  p_tournament_ids UUID[],
  p_player_ids     UUID[]
)
RETURNS TABLE(
  tournament_id   UUID,
  tournament_name TEXT,
  workspace_name  TEXT,
  status          TEXT,
  player_position INT,
  total_players   INT,
  deck_pokemon1   INT,
  deck_pokemon2   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input AS (
    SELECT unnest(p_tournament_ids) AS tid, unnest(p_player_ids) AS pid
  ),
  field AS (
    SELECT ts.tournament_id, COUNT(*)::INT AS n
    FROM public.tournament_standings ts
    WHERE ts.tournament_id = ANY(p_tournament_ids)
    GROUP BY ts.tournament_id
  )
  SELECT
    t.id::UUID             AS tournament_id,
    t.name::TEXT           AS tournament_name,
    w.name::TEXT           AS workspace_name,
    t.status::TEXT         AS status,
    CASE WHEN t.status = 'completed' THEN ts.position ELSE NULL END AS player_position,
    CASE WHEN t.status = 'completed' THEN f.n         ELSE NULL END AS total_players,
    tp_me.deck_pokemon1    AS deck_pokemon1,
    tp_me.deck_pokemon2    AS deck_pokemon2
  FROM input i
  JOIN public.tournaments  t     ON t.id = i.tid
  JOIN public.workspaces   w     ON w.id = t.workspace_id
  LEFT JOIN public.tournament_standings ts ON ts.tournament_id = i.tid AND ts.player_id = i.pid
  LEFT JOIN field f  ON f.tournament_id = i.tid
  LEFT JOIN public.tournament_players tp_me
                                 ON tp_me.id = i.pid AND tp_me.tournament_id = i.tid;
END;
$$;
