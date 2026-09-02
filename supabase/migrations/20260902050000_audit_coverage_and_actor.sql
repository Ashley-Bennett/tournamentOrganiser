-- ============================================================
-- Audit log: attribute anonymous actions, and cover the tables
-- added since the trigger was written (2026-09-02)
--
-- Two gaps, both dating from the original 20260308000000:
--
-- 1. ATTRIBUTION. The device-token player RPCs (submit_match_result,
--    self_join_tournament, set_player_deck, self_claim_player_entry)
--    are granted to anon, so auth.uid() is NULL inside them and every
--    row they touch was audited with user_id = NULL. Those rows are
--    invisible to audit_log_select_own forever, and delete_account()'s
--    "DELETE ... WHERE user_id = v_uid" never reaches them. The single
--    most dispute-relevant action in the product — a player reporting
--    their own result — was the one recorded unattributably.
--
--    Fix: a transaction-local GUC, app.actor_label, set by the RPCs and
--    read by the trigger. A GUC rather than an argument because the
--    audited writes happen several layers down (assert_player_access ->
--    caller -> UPDATE tournament_matches, and cascades below that), and
--    a transaction-local setting reaches all of them without threading a
--    parameter through every signature. PostgREST runs one transaction
--    per request, and set_config(..., true) is transaction-scoped, so
--    the label cannot leak between requests.
--
--    The label is 'player:<tournament_player_id>' — an identifier that
--    is already visible to anyone who can see the player list. It is
--    deliberately NOT the device token: that would recreate the leak
--    20260902040000 just closed.
--
--    Set in assert_player_access() because every device-token RPC
--    already funnels through it, so one edit covers submit_match_result,
--    set_player_deck and self_claim_player_entry. self_join_tournament
--    creates the row rather than authenticating against one, so it sets
--    the label itself.
--
-- 2. COVERAGE. Six months and ~90 migrations added tables that were
--    never wired in. Added here, worst-first by forensic value:
--      match_result_reports     — the evidence in a disputed match
--      workspace_player_links   — identity merges, which permanently
--                                 fuse two players' histories
--      workspace_memberships    — role grants and removals
--      tournament_player_claims — account linking, impersonation-adjacent
--    Deliberately skipped: push_subscriptions and tournament_standings
--    (high churn, low forensic value), profiles and workspaces (little
--    changes, and what does is covered by the membership trail).
--
--    workspace_player_links has NO id column — its primary key is
--    tournament_player_id — so the trigger's hardcoded "->> 'id'" would
--    have recorded record_id = NULL and made the row unaddressable. The
--    key column is now a trigger argument, defaulting to 'id'.
-- ============================================================

-- 1. Attribution column
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_label TEXT;

COMMENT ON COLUMN public.audit_log.actor_label IS
  'Who acted when user_id is NULL — anonymous device-token players, as '
  '''player:<tournament_player_id>''. Never a credential.';

-- Drill-down by actor for the anonymous case, mirroring audit_log_user_changed_idx.
CREATE INDEX IF NOT EXISTS audit_log_actor_changed_idx
  ON public.audit_log (actor_label, changed_at DESC)
  WHERE actor_label IS NOT NULL;

-- 2. Setter. Transaction-local, so it expires with the request.
CREATE OR REPLACE FUNCTION public.set_audit_actor(p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.actor_label', COALESCE(p_label, ''), true);
END;
$$;

-- Internal helper: called by the SECURITY DEFINER RPCs, never by clients.
REVOKE ALL ON FUNCTION public.set_audit_actor(TEXT) FROM PUBLIC, anon, authenticated;

-- 3. Trigger function: keyed record id, actor label, existing redaction
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Keys never written to the audit log, on any audited table.
  c_redacted CONSTANT TEXT[] := ARRAY['device_token', 'device_id'];
  -- Primary key column, passed when the table's key is not 'id'.
  v_key_col   TEXT := COALESCE(TG_ARGV[0], 'id');
  v_record_id UUID;
  v_old_data  JSONB;
  v_new_data  JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_record_id := (to_jsonb(NEW) ->> v_key_col)::UUID;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW) - c_redacted;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (to_jsonb(NEW) ->> v_key_col)::UUID;
    v_old_data  := to_jsonb(OLD) - c_redacted;
    v_new_data  := to_jsonb(NEW) - c_redacted;
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> v_key_col)::UUID;
    v_old_data  := to_jsonb(OLD) - c_redacted;
    v_new_data  := NULL;
  END IF;

  INSERT INTO public.audit_log (
    table_name, record_id, operation, user_id, actor_label, old_data, new_data
  )
  VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP,
    (SELECT auth.uid()),
    NULLIF(current_setting('app.actor_label', true), ''),
    v_old_data, v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Label the device-token paths.
--    assert_player_access is unchanged except for the set_audit_actor call:
--    every RPC that authenticates a player by token or account already
--    calls it, so this one edit attributes all of them.
CREATE OR REPLACE FUNCTION public.assert_player_access(
  p_player_id      UUID,
  p_tournament_id  UUID,
  p_device_token   TEXT
)
RETURNS public.tournament_players
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_player public.tournament_players%ROWTYPE;
BEGIN
  SELECT * INTO v_player
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id
    AND (p_tournament_id IS NULL OR tp.tournament_id = p_tournament_id)
    AND (
      -- Anonymous / device-bound access: holder of the row's secret.
      (p_device_token IS NOT NULL AND tp.device_token = p_device_token)
      OR
      -- Account-bound access: signed in as the linked user.
      (auth.uid() IS NOT NULL AND tp.user_id = auth.uid())
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  -- Attribute everything this transaction goes on to write. Harmless when
  -- the caller is signed in — user_id is recorded too, and is preferred.
  PERFORM public.set_audit_actor('player:' || v_player.id);

  RETURN v_player;
END;
$$;

-- 5. Triggers on the newly covered tables
DROP TRIGGER IF EXISTS audit_match_result_reports ON public.match_result_reports;
CREATE TRIGGER audit_match_result_reports
  AFTER INSERT OR UPDATE OR DELETE ON public.match_result_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS audit_workspace_memberships ON public.workspace_memberships;
CREATE TRIGGER audit_workspace_memberships
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS audit_tournament_player_claims ON public.tournament_player_claims;
CREATE TRIGGER audit_tournament_player_claims
  AFTER INSERT OR UPDATE OR DELETE ON public.tournament_player_claims
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- Keyed on tournament_player_id: this table has no id column.
DROP TRIGGER IF EXISTS audit_workspace_player_links ON public.workspace_player_links;
CREATE TRIGGER audit_workspace_player_links
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_player_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger('tournament_player_id');

-- 6. self_join_tournament creates the player rather than authenticating an
--    existing one, so it cannot go through assert_player_access. Reproduced
--    from the deployed definition with only the labelled INSERT below
--    changed, so that the join itself and the late-entry pairing it kicks
--    off are both attributed.

CREATE OR REPLACE FUNCTION public.self_join_tournament(p_tournament_id uuid, p_player_name text, p_device_id text DEFAULT NULL::text, p_pokemon1 integer DEFAULT NULL::integer, p_pokemon2 integer DEFAULT NULL::integer, p_confirmed_distinct boolean DEFAULT false)
 RETURNS TABLE(player_id uuid, device_token text, tournament_name text, duplicate_of text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id     UUID;
  v_status           TEXT;
  v_join_enabled     BOOLEAN;
  v_allow_late_join  BOOLEAN;
  v_until_round      INTEGER;
  v_tournament_name  TEXT;
  v_player_id        UUID;
  v_device_token     TEXT;
  v_trimmed_name     TEXT;
  v_is_late_entry    BOOLEAN := FALSE;
  v_current_round    INTEGER;
  v_duplicate_of     TEXT;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  IF length(v_trimmed_name) > 50 THEN
    RAISE EXCEPTION 'Player name is too long (max 50 characters)';
  END IF;

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  -- Lock the tournament so concurrent joins serialise: without this, two players
  -- scanning the QR at the same moment could both absorb the same waiting bye.
  SELECT t.workspace_id, t.status, t.join_enabled, t.allow_late_join,
         t.late_join_until_round, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_allow_late_join,
       v_until_round, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_status = 'draft' THEN
    IF NOT v_join_enabled THEN
      RAISE EXCEPTION 'Registration is not open for this tournament';
    END IF;

  ELSIF v_status = 'active' THEN
    IF NOT v_allow_late_join THEN
      RAISE EXCEPTION 'Registration is closed';
    END IF;

    v_is_late_entry := TRUE;

    SELECT COALESCE(MAX(m.round_number), 1) INTO v_current_round
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id;

    -- Optional cutoff. NULL means no limit.
    IF v_until_round IS NOT NULL AND v_current_round > v_until_round THEN
      RAISE EXCEPTION 'Late entry closed after round %', v_until_round;
    END IF;

  ELSE
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  -- Does the organiser look to have signed this person up already? Ask, don't
  -- refuse — and write nothing until we have an answer.
  IF NOT p_confirmed_distinct THEN
    v_duplicate_of := public._find_possible_duplicate_entry(
      p_tournament_id, v_trimmed_name
    );

    IF v_duplicate_of IS NOT NULL THEN
      RETURN QUERY SELECT
        NULL::UUID, NULL::TEXT, v_tournament_name::TEXT, v_duplicate_of;
      RETURN;
    END IF;
  END IF;

  -- Case-insensitive duplicate name check. Still absolute: even a confirmed
  -- different person cannot take a name that is already in the tournament.
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND lower(name) = lower(v_trimmed_name)
  ) THEN
    RAISE EXCEPTION 'A player with that name is already registered';
  END IF;

  -- Generate a 64-char hex token using gen_random_uuid() (no pgcrypto path issues)
  v_device_token := replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '');

  -- Pre-generate the id so the audit row for this INSERT carries the actor
  -- label as well. The trigger fires during the INSERT, so a label set from
  -- a RETURNING value afterwards would arrive one row too late.
  v_player_id := gen_random_uuid();
  PERFORM public.set_audit_actor('player:' || v_player_id);

  INSERT INTO public.tournament_players (
    id, tournament_id, workspace_id, name, device_token, device_id,
    deck_pokemon1, deck_pokemon2, user_id, is_late_entry, late_entry_round
  )
  VALUES (
    v_player_id, p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    p_pokemon1, p_pokemon2,
    auth.uid(),  -- NULL for anonymous, user id for authenticated (auto-link)
    v_is_late_entry,
    CASE WHEN v_is_late_entry THEN v_current_round ELSE NULL END
  );

  IF v_is_late_entry THEN
    PERFORM public._apply_late_entry_pairing_unchecked(v_player_id, p_tournament_id);
  END IF;

  RETURN QUERY SELECT
    v_player_id, v_device_token, v_tournament_name::TEXT, NULL::TEXT;
END;
$function$;
