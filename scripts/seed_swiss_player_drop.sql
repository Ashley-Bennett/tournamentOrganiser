-- Seed a swiss tournament: 6 players, Eve drops after round 2, round 3 active.
-- Eve had 2 wins but dropped, so round 3 has 2 matches + a bye for Alice.
-- Run with:
--   psql postgresql://postgres:postgres@localhost:54322/postgres -f scripts/seed_swiss_player_drop.sql

DO $$
DECLARE
  v_user_id  UUID;
  v_ws_id    UUID;
  v_tourn_id UUID := gen_random_uuid();
  p1 UUID := gen_random_uuid();
  p2 UUID := gen_random_uuid();
  p3 UUID := gen_random_uuid();
  p4 UUID := gen_random_uuid();
  p5 UUID := gen_random_uuid(); -- Eve — drops after round 2
  p6 UUID := gen_random_uuid();
BEGIN
  v_user_id := 'b1d968a3-b643-4b52-aa30-1343012010d8'; -- a@a.a
  v_ws_id   := '79ceaa77-603f-4718-abeb-602946e1d8d8'; -- Bulwark games

  -- Tournament
  INSERT INTO public.tournaments (id, name, created_by, status, tournament_type, num_rounds, workspace_id)
  VALUES (v_tourn_id, 'Test Tournament (drop)', v_user_id, 'active', 'swiss', 3, v_ws_id);

  -- Players (Eve inserted normally; dropped flag set below)
  INSERT INTO public.tournament_players (id, tournament_id, name, created_by, workspace_id)
  VALUES
    (p1, v_tourn_id, 'Alice',   v_user_id, v_ws_id),
    (p2, v_tourn_id, 'Bob',     v_user_id, v_ws_id),
    (p3, v_tourn_id, 'Charlie', v_user_id, v_ws_id),
    (p4, v_tourn_id, 'Diana',   v_user_id, v_ws_id),
    (p5, v_tourn_id, 'Eve',     v_user_id, v_ws_id),
    (p6, v_tourn_id, 'Frank',   v_user_id, v_ws_id);

  -- Mark Eve as dropped after round 2
  UPDATE public.tournament_players
  SET dropped = true, dropped_at_round = 2
  WHERE id = p5;

  -- Round 1 (completed): p1 beat p2, p3 beat p4, p5 beat p6
  INSERT INTO public.tournament_matches
    (tournament_id, round_number, player1_id, player2_id, winner_id, result, status, match_number, pairings_published, workspace_id)
  VALUES
    (v_tourn_id, 1, p1, p2, p1, '1-0', 'completed', 1, true, v_ws_id),
    (v_tourn_id, 1, p3, p4, p3, '1-0', 'completed', 2, true, v_ws_id),
    (v_tourn_id, 1, p5, p6, p5, '1-0', 'completed', 3, true, v_ws_id);

  -- Round 2 (completed): p1 beat p3, p5 beat p2, p4 beat p6
  INSERT INTO public.tournament_matches
    (tournament_id, round_number, player1_id, player2_id, winner_id, result, status, match_number, pairings_published, workspace_id)
  VALUES
    (v_tourn_id, 2, p1, p3, p1, '1-0', 'completed', 1, true, v_ws_id),
    (v_tourn_id, 2, p5, p2, p5, '1-0', 'completed', 2, true, v_ws_id),
    (v_tourn_id, 2, p4, p6, p4, '1-0', 'completed', 3, true, v_ws_id);

  -- Round 3 (active): Eve dropped, so Alice gets a bye; remaining 4 players paired normally
  INSERT INTO public.tournament_matches
    (tournament_id, round_number, player1_id, player2_id, status, match_number, pairings_published, workspace_id)
  VALUES
    (v_tourn_id, 3, p3, p4, 'ready', 1, true, v_ws_id),
    (v_tourn_id, 3, p2, p6, 'ready', 2, true, v_ws_id);

  -- Alice bye in round 3 (player2_id NULL = bye)
  INSERT INTO public.tournament_matches
    (tournament_id, round_number, player1_id, player2_id, winner_id, result, status, match_number, pairings_published, workspace_id)
  VALUES
    (v_tourn_id, 3, p1, NULL, p1, 'BYE', 'completed', 3, true, v_ws_id);

  -- Standings after rounds 1 & 2 (Eve still has her points, just marked dropped)
  -- p1: 2W, p5(dropped): 2W, p3: 1W 1L, p4: 1W 1L, p2: 0W 2L, p6: 0W 2L
  INSERT INTO public.tournament_standings
    (tournament_id, player_id, match_points, wins, losses, draws, matches_played, byes_received, workspace_id)
  VALUES
    (v_tourn_id, p1, 6, 2, 0, 0, 2, 0, v_ws_id),
    (v_tourn_id, p2, 0, 0, 2, 0, 2, 0, v_ws_id),
    (v_tourn_id, p3, 3, 1, 1, 0, 2, 0, v_ws_id),
    (v_tourn_id, p4, 3, 1, 1, 0, 2, 0, v_ws_id),
    (v_tourn_id, p5, 6, 2, 0, 0, 2, 0, v_ws_id),
    (v_tourn_id, p6, 0, 0, 2, 0, 2, 0, v_ws_id);

  RAISE NOTICE 'Done. Tournament ID: %', v_tourn_id;
END;
$$;

-- To clean up, run this:
-- DELETE FROM public.tournaments WHERE name = 'Test Tournament (drop)' AND workspace_id = '79ceaa77-603f-4718-abeb-602946e1d8d8';
-- (players, matches, and standings are deleted automatically via CASCADE)
