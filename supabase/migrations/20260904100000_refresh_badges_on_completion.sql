-- ============================================================
-- Badges recomputed when an event finishes (2026-09-04)
--
-- Until now refresh_my_badges was the only thing that wrote
-- player_badge, and it only ever ran when a player opened their
-- own account page. Nobody else's badges recomputed, so somebody
-- who won on Thursday and did not open the app carried a stale
-- count on Friday's pairing board — visible to the whole room.
--
-- Closing an event is the right moment: it is when the counts
-- actually change, and it is when the room cares. Rounds are
-- deliberately not a trigger. Attendance and placements are both
-- settled at the end, and refreshing every entrant four times an
-- evening would be the same work repeated.
--
-- SECURITY NOTE
-- This is the first function that writes player_badge rows for
-- someone other than the caller, which is exactly why:
--   * it is NOT granted to authenticated, anon or public — the
--     only caller is the trigger below;
--   * it takes a tournament id, never a list of users, so it
--     cannot be pointed at arbitrary people even if it were
--     reachable;
--   * it derives everything from history via badge_events and
--     trusts no value passed in.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- refresh_tournament_badges
--
-- Recomputes the saved badges of every entrant in one event who
-- has an account, and reports who gained a badge they had never
-- held before.
--
-- Only the entrants are touched, not the whole workspace: their
-- counts are the ones this event just changed.
--
-- Returns one row per user who now holds a badge kind they did
-- not hold at all beforehand. A *tier* promotion — 5 events
-- becoming 25 and turning Familiar Face into Regular — is
-- deliberately not reported, because the thresholds live in the
-- frontend registry and duplicating them here would make this a
-- second place to keep them right. The client owns that, and
-- always has.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.refresh_tournament_badges(UUID);

CREATE FUNCTION public.refresh_tournament_badges(
  p_tournament_id UUID
)
-- Named apart from the table's own columns on purpose: as
-- user_id/badge_id these OUT parameters shadow player_badge's
-- columns inside ON CONFLICT, which fails to parse.
RETURNS TABLE(earner_id UUID, earned_badge_id TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT tp.user_id)
    INTO v_ids
  FROM public.tournament_players tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.user_id IS NOT NULL;

  -- An event of walk-ins with no accounts is the common case and
  -- is not an error.
  IF v_ids IS NULL OR CARDINALITY(v_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH before AS (
    -- Snapshot first: the INSERT below is what we are comparing
    -- against, so it has to be read before anything is written.
    SELECT DISTINCT pb.user_id, pb.badge_id
    FROM public.player_badge pb
    WHERE pb.user_id = ANY(v_ids)
  ),
  fresh AS (
    SELECT
      e.user_id,
      e.badge_id,
      e.workspace_id,
      e.game_id,
      COUNT(*)::INT AS badge_count,
      -- Capped the same way refresh_my_badges caps it: a decade of
      -- weekly attendance is ~500 dates and the badge case only
      -- ever reads the ones a threshold lands on.
      TO_JSONB(
        (ARRAY_AGG(e.played_at ORDER BY e.played_at))[1:200]
      ) AS earned_at
    FROM public.badge_events(v_ids) e
    GROUP BY e.user_id, e.badge_id, e.workspace_id, e.game_id
  ),
  wiped AS (
    -- Anything no longer earned must go, or a stale row would
    -- outlive the history that justified it.
    DELETE FROM public.player_badge pb
    WHERE pb.user_id = ANY(v_ids)
      AND NOT EXISTS (
        SELECT 1 FROM fresh f
        WHERE f.user_id      = pb.user_id
          AND f.badge_id     = pb.badge_id
          AND f.workspace_id IS NOT DISTINCT FROM pb.workspace_id
          AND f.game_id      IS NOT DISTINCT FROM pb.game_id
      )
    RETURNING 1
  ),
  written AS (
    INSERT INTO public.player_badge
      (user_id, badge_id, workspace_id, game_id, badge_count, earned_at, updated_at)
    SELECT f.user_id, f.badge_id, f.workspace_id, f.game_id,
           f.badge_count, f.earned_at, NOW()
    FROM fresh f
    ON CONFLICT (user_id, badge_id, workspace_id, game_id) DO UPDATE
      SET badge_count = EXCLUDED.badge_count,
          earned_at   = EXCLUDED.earned_at,
          updated_at  = NOW()
    RETURNING player_badge.user_id, player_badge.badge_id
  )
  SELECT DISTINCT w.user_id, w.badge_id
  FROM written w
  WHERE NOT EXISTS (
    SELECT 1 FROM before b
    WHERE b.user_id = w.user_id AND b.badge_id = w.badge_id
  );
END;
$$;

-- Deliberately no GRANT: the trigger below is the only caller, and it
-- runs as the definer.
--
-- Revoking from PUBLIC is NOT enough. Supabase ships default privileges
-- that grant EXECUTE on every new function in `public` to anon and
-- authenticated, so a bare "REVOKE ... FROM PUBLIC" leaves those two
-- role grants standing and the function reachable over PostgREST.
-- The roles have to be named.
REVOKE ALL ON FUNCTION public.refresh_tournament_badges(UUID)
  FROM PUBLIC, anon, authenticated;

-- badge_events was written with the same intent and the same mistake, so
-- it has been callable by any signed-in user since it shipped. It reads
-- other people's match history — scoped to workspaces the caller belongs
-- to, so not a leak to strangers, but far wider than the "internal
-- helper" it was meant to be. Closing it here, with the function that
-- leans on it.
REVOKE ALL ON FUNCTION public.badge_events(UUID[])
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- notify_tournament_completed — now refreshes badges too.
--
-- Wrapped in its own exception block. An organiser closing an
-- event must never fail because a badge miscounted: the standings
-- are the thing that matters, and stale badges are a cosmetic
-- problem that the player's next visit to their own account will
-- fix anyway.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_tournament_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_players UUID[];
BEGIN
  PERFORM public.invoke_send_push(JSONB_BUILD_OBJECT(
    'type', 'standings_ready',
    'tournament_id', NEW.id
  ));

  BEGIN
    -- Entrant ids rather than account ids: the push targets are
    -- keyed by tournament_player, and the browser being notified
    -- belongs to an entry rather than to a person.
    SELECT ARRAY_AGG(DISTINCT tp.id)
      INTO v_new_players
    FROM public.refresh_tournament_badges(NEW.id) r
    JOIN public.tournament_players tp
      ON tp.tournament_id = NEW.id AND tp.user_id = r.earner_id;

    IF v_new_players IS NOT NULL AND CARDINALITY(v_new_players) > 0 THEN
      PERFORM public.invoke_send_push(JSONB_BUILD_OBJECT(
        'type', 'badge_earned',
        'tournament_id', NEW.id,
        'player_ids', TO_JSONB(v_new_players)
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'badge refresh after tournament % failed: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;
