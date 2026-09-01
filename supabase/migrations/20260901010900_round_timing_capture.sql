-- ============================================================
-- Round timing capture (2026-09-01) — Phase 8a
--
-- Nothing in the app has ever recorded when a game finished or when a
-- round began, so no timing stat was derivable:
--
--   * tournament_matches.updated_at is DEFAULT now() at INSERT and no
--     trigger maintains it, so it holds the moment the pairing was
--     generated, not the moment the game ended;
--   * tournaments.current_round_started_at is a single slot for the
--     whole event. It is cleared when the round advances, and pausing
--     nulls it too, so even mid-round it is the start of the current
--     unpaused segment rather than of the round;
--   * round_elapsed_seconds is reset to 0 by the next Begin Round.
--
-- This migration adds the two missing facts. It is forward-only by
-- design: existing rows get NULL and are excluded from timing stats.
--
-- The live timer keeps working exactly as it does today — the columns
-- it uses are untouched. This records durable history alongside it.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- tournament_matches.result_recorded_at
--
-- When the result was FIRST recorded. Set by trigger rather than by each caller
-- because results are written from several places (the organiser's bulk save,
-- the single-match dialog, bye completion, player-report confirmation) and a
-- column only some of them remember to set is worse than no column at all.
--
-- Never moved once set: correcting a result an hour later must not retroactively
-- turn a twelve-minute game into a seventy-two minute one.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS result_recorded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tournament_matches.result_recorded_at IS
  'When this match was first completed. Set once by trigger; never updated by later corrections. NULL for matches that predate 2026-09-01.';

CREATE OR REPLACE FUNCTION public.set_result_recorded_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Byes are deliberately excluded: nobody played, so a duration would be
  -- meaningless and would drag every average down.
  IF NEW.status = 'completed'
     AND NEW.result_recorded_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
  THEN
    NEW.result_recorded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_result_recorded_at ON public.tournament_matches;
CREATE TRIGGER trg_set_result_recorded_at
  BEFORE INSERT OR UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_result_recorded_at();

-- result_recorded_at is only ever read for completed, non-bye matches.
CREATE INDEX IF NOT EXISTS idx_matches_result_recorded
  ON public.tournament_matches (tournament_id, round_number)
  WHERE result_recorded_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- tournament_rounds
--
-- One durable row per round. The tournaments table keeps driving the live
-- countdown; this is the history it throws away.
--
-- duration_minutes is snapshotted when the round begins, not read from the
-- tournament at query time: an organiser who lengthens the timer next week must
-- not retroactively change what share of the clock last week's games used.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  tournament_id    UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number     INT         NOT NULL,
  workspace_id     UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  -- Accumulated pause time, so a round paused for lunch does not read as a
  -- three-hour round.
  paused_seconds   INT         NOT NULL DEFAULT 0,
  -- Set while currently paused; folded into paused_seconds on resume or end.
  paused_at        TIMESTAMPTZ,
  duration_minutes INT,
  PRIMARY KEY (tournament_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_workspace
  ON public.tournament_rounds (workspace_id);

ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;

-- Members read; all writes go through the SECURITY DEFINER RPCs below, so
-- there are deliberately no INSERT/UPDATE/DELETE policies.
CREATE POLICY "tournament_rounds_select_member"
  ON public.tournament_rounds FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Round lifecycle RPCs
--
-- Called alongside the existing timer writes. Each is idempotent enough to
-- survive a double click: beginning a round that already started keeps the
-- original start, and resuming a round that is not paused does nothing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.begin_tournament_round(
  p_tournament_id UUID,
  p_round_number  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_duration     INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id, t.round_duration_minutes
    INTO v_workspace_id, v_duration
  FROM public.tournaments t WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  -- ON CONFLICT DO NOTHING: re-beginning a round must not reset its clock.
  INSERT INTO public.tournament_rounds
    (tournament_id, round_number, workspace_id, started_at, duration_minutes)
  VALUES
    (p_tournament_id, p_round_number, v_workspace_id, now(), v_duration)
  ON CONFLICT (tournament_id, round_number) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_tournament_round(
  p_tournament_id UUID,
  p_round_number  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  UPDATE public.tournament_rounds
     SET paused_at = now()
   WHERE tournament_id = p_tournament_id
     AND round_number  = p_round_number
     AND paused_at IS NULL
     AND ended_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_tournament_round(
  p_tournament_id UUID,
  p_round_number  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  UPDATE public.tournament_rounds
     SET paused_seconds = paused_seconds
                        + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - paused_at)))::INT),
         paused_at      = NULL
   WHERE tournament_id = p_tournament_id
     AND round_number  = p_round_number
     AND paused_at IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_tournament_round(
  p_tournament_id UUID,
  p_round_number  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  -- Ending while paused folds the outstanding pause in, so no time is lost.
  UPDATE public.tournament_rounds
     SET ended_at       = now(),
         paused_seconds = paused_seconds
                        + CASE
                            WHEN paused_at IS NOT NULL
                            THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - paused_at)))::INT)
                            ELSE 0
                          END,
         paused_at      = NULL
   WHERE tournament_id = p_tournament_id
     AND round_number  = p_round_number
     AND ended_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_tournament_round(UUID, INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_tournament_round(UUID, INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_tournament_round(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_tournament_round(UUID, INT)    TO authenticated;
