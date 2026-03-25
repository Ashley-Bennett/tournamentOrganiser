-- ── match_result_reports ────────────────────────────────────────────────────
-- Stores player-submitted match outcome reports before confirmation.
-- No direct RLS client access — all operations via SECURITY DEFINER RPCs.

CREATE TABLE public.match_result_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  player_id        UUID        NOT NULL REFERENCES public.tournament_players(id) ON DELETE CASCADE,
  reported_outcome TEXT        NOT NULL CHECK (reported_outcome IN ('win', 'loss', 'draw')),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

ALTER TABLE public.match_result_reports ENABLE ROW LEVEL SECURITY;
-- No policies = no direct client access. All reads/writes through SECURITY DEFINER RPCs.

-- ── confirmed_by on tournament_matches ──────────────────────────────────────
-- Tracks who confirmed each match result: organiser, or player auto-agreement.
-- NULL = not yet confirmed / legacy rows.

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT
    CHECK (confirmed_by IN ('organiser', 'player_agreement'));

-- ── cleanup trigger ──────────────────────────────────────────────────────────
-- When any match transitions to completed (by organiser or by player agreement),
-- purge any pending match_result_reports rows for that match.

CREATE OR REPLACE FUNCTION public.cleanup_match_reports_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    DELETE FROM public.match_result_reports WHERE match_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_match_reports
AFTER UPDATE ON public.tournament_matches
FOR EACH ROW EXECUTE FUNCTION public.cleanup_match_reports_on_complete();
