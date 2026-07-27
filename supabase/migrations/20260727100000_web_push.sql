-- ============================================================
-- Phase 2 — Web Push notifications
--
-- Server-side notification plumbing. The DB is the source of
-- truth: organiser round actions are plain table writes
-- (see useRoundLifecycle.ts), so triggers here fire regardless
-- of which client made the change.
--
--   pairing_up      → trigger on tournament_matches.pairings_published
--   standings_ready → trigger on tournaments.status = 'completed'
--   time_up         → pg_cron scan of active round timers
--
-- All three call invoke_send_push(), which POSTs to the
-- `send-push` Edge Function via pg_net. invoke_send_push is a
-- RESILIENT NO-OP when the Vault secret isn't configured or the
-- HTTP call fails — a notification must NEVER roll back or block
-- a tournament write.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---- 1. Subscription storage --------------------------------

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A subscription (browser) can follow several tournaments; per-tournament
-- it is either a player (tournament_player_id set, for personalised pairing
-- alerts) or the organiser (is_organiser = true, broadcast only).
CREATE TABLE IF NOT EXISTS public.push_subscription_targets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      UUID NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  tournament_id        UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  tournament_player_id UUID REFERENCES public.tournament_players(id) ON DELETE CASCADE,
  is_organiser         BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pst_tournament ON public.push_subscription_targets(tournament_id);
CREATE INDEX IF NOT EXISTS idx_pst_subscription ON public.push_subscription_targets(subscription_id);

ALTER TABLE public.push_subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscription_targets ENABLE ROW LEVEL SECURITY;

-- Signed-in users may see/remove their own subscriptions. Anonymous players
-- write only through the SECURITY DEFINER RPCs below; the Edge Function reads
-- with the service role (bypasses RLS). Targets table has no client policies.
DROP POLICY IF EXISTS push_subscriptions_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---- 2. Idempotency marker for round-timer alerts -----------

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS round_timeup_notified_round INT;

-- ---- 3. Notify plumbing (pg_net → Edge Function) ------------
-- Reads the function URL + shared secret from Supabase Vault
-- (set out-of-band with vault.create_secret so they're not in git).

CREATE OR REPLACE FUNCTION public.invoke_send_push(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url   TEXT;
  v_token TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'send_push_url' LIMIT 1;
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets WHERE name = 'send_push_token' LIMIT 1;

    IF v_url IS NULL OR v_token IS NULL THEN
      RETURN;  -- not configured yet — do nothing
    END IF;

    PERFORM net.http_post(
      url     := v_url,
      body    := p_payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a notification failure roll back the caller's transaction.
    RAISE WARNING 'invoke_send_push failed: %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_push(JSONB) FROM PUBLIC, anon, authenticated;

-- ---- 4. Event triggers --------------------------------------

-- pairing_up: statement-level with transition tables so publishing a whole
-- round (many rows in one UPDATE) fires ONE push per (tournament, round).
CREATE OR REPLACE FUNCTION public.notify_pairings_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT n.tournament_id, n.round_number
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE n.pairings_published AND NOT COALESCE(o.pairings_published, false)
  LOOP
    PERFORM public.invoke_send_push(jsonb_build_object(
      'type', 'pairing_up',
      'tournament_id', r.tournament_id,
      'round', r.round_number
    ));
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pairings_published ON public.tournament_matches;
CREATE TRIGGER trg_notify_pairings_published
  AFTER UPDATE ON public.tournament_matches
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.notify_pairings_published();

-- standings_ready: fires once when a tournament flips to completed.
CREATE OR REPLACE FUNCTION public.notify_tournament_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type', 'standings_ready',
    'tournament_id', NEW.id
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_tournament_completed ON public.tournaments;
CREATE TRIGGER trg_notify_tournament_completed
  AFTER UPDATE ON public.tournaments
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.notify_tournament_completed();

-- ---- 5. Round-timer expiry scan (pg_cron, once a minute) ----

CREATE OR REPLACE FUNCTION public.enqueue_due_round_timeups()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      RECORD;
  v_round INT;
BEGIN
  FOR r IN
    SELECT t.id, t.round_timeup_notified_round
    FROM public.tournaments t
    WHERE t.status = 'active'
      AND t.round_is_paused = false
      AND t.current_round_started_at IS NOT NULL
      AND t.round_duration_minutes IS NOT NULL
      AND now() >= t.current_round_started_at
          + make_interval(secs =>
              t.round_duration_minutes * 60 - COALESCE(t.round_elapsed_seconds, 0))
  LOOP
    -- Active round = highest round still being played.
    SELECT max(round_number) INTO v_round
    FROM public.tournament_matches
    WHERE tournament_id = r.id AND status = 'pending';

    IF v_round IS NULL THEN CONTINUE; END IF;
    IF r.round_timeup_notified_round IS NOT DISTINCT FROM v_round THEN CONTINUE; END IF;

    PERFORM public.invoke_send_push(jsonb_build_object(
      'type', 'time_up',
      'tournament_id', r.id,
      'round', v_round
    ));

    UPDATE public.tournaments
      SET round_timeup_notified_round = v_round
      WHERE id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_round_timeups() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'find-due-round-timeups') THEN
    PERFORM cron.unschedule('find-due-round-timeups');
  END IF;
END $$;

SELECT cron.schedule(
  'find-due-round-timeups',
  '* * * * *',
  $$SELECT public.enqueue_due_round_timeups()$$
);

-- ---- 6. Client-facing subscription RPCs ---------------------

-- Player subscribe: validates device_token against the player row (same check
-- as get_player_tournament_view), upserts the browser subscription, and links
-- it to this tournament as a player. Re-links cleanly on repeat calls.
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint             TEXT,
  p_p256dh               TEXT,
  p_auth                 TEXT,
  p_tournament_player_id UUID,
  p_device_token         TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id        UUID;
  v_tournament_id UUID;
BEGIN
  SELECT tournament_id INTO v_tournament_id
  FROM public.tournament_players
  WHERE id = p_tournament_player_id AND device_token = p_device_token;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  INSERT INTO public.push_subscriptions (endpoint, p256dh, auth, user_id, last_seen_at)
  VALUES (p_endpoint, p_p256dh, p_auth, auth.uid(), now())
  ON CONFLICT (endpoint) DO UPDATE
    SET p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        user_id      = COALESCE(EXCLUDED.user_id, public.push_subscriptions.user_id),
        last_seen_at = now()
  RETURNING id INTO v_sub_id;

  DELETE FROM public.push_subscription_targets
  WHERE subscription_id = v_sub_id
    AND tournament_id = v_tournament_id
    AND is_organiser = false;

  INSERT INTO public.push_subscription_targets
    (subscription_id, tournament_id, tournament_player_id, is_organiser)
  VALUES (v_sub_id, v_tournament_id, p_tournament_player_id, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, UUID, TEXT)
  TO anon, authenticated;

-- Organiser subscribe: must manage the tournament's workspace. Links the
-- browser as an organiser (broadcast: time_up + standings_ready), not per-player.
CREATE OR REPLACE FUNCTION public.link_organiser_push(
  p_endpoint      TEXT,
  p_p256dh        TEXT,
  p_auth          TEXT,
  p_tournament_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id UUID;
  v_ws     UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_ws FROM public.tournaments WHERE id = p_tournament_id;
  IF v_ws IS NULL OR NOT public.can_manage_workspace(v_ws) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.push_subscriptions (endpoint, p256dh, auth, user_id, last_seen_at)
  VALUES (p_endpoint, p_p256dh, p_auth, auth.uid(), now())
  ON CONFLICT (endpoint) DO UPDATE
    SET p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        user_id      = COALESCE(EXCLUDED.user_id, public.push_subscriptions.user_id),
        last_seen_at = now()
  RETURNING id INTO v_sub_id;

  DELETE FROM public.push_subscription_targets
  WHERE subscription_id = v_sub_id
    AND tournament_id = p_tournament_id
    AND is_organiser = true;

  INSERT INTO public.push_subscription_targets
    (subscription_id, tournament_id, tournament_player_id, is_organiser)
  VALUES (v_sub_id, p_tournament_id, NULL, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_organiser_push(TEXT, TEXT, TEXT, UUID)
  TO authenticated;

-- Unsubscribe (browser permission revoked or user opt-out).
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO anon, authenticated;
