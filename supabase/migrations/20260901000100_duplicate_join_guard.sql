-- ── Catching a player who has already been signed up by hand ─────────────────
-- The failure this prevents: a player asks the organiser to register them, then
-- also registers themselves on their phone under a slightly different name
-- ("Dave" vs "David Smith"). Nobody notices until pairings are published and
-- the tournament has an extra person in it.
--
-- The old exact-name guard could not catch it, and the join page made it worse:
-- on an exact clash it told the player "That name is already taken. Pick a
-- different one." — which is an instruction to create the duplicate.
--
-- Two changes:
--
--   1. self_join_tournament now looks for a NEAR match before inserting, and
--      returns it as a question instead of an error. Answering "yes, that's me"
--      creates nothing.
--
--   2. The check only considers entries the organiser added by hand
--      (created_by IS NOT NULL — self-registered rows leave it NULL). Two
--      players who both typed their own similar names are probably two people;
--      an organiser-typed name that looks like yours probably IS you.
--
-- Deliberately not done here: letting the player claim the organiser's entry
-- themselves. That would hand player-portal access — including result
-- reporting — to anyone who can guess a name off the entry list. Instead they
-- are told to see the organiser, who links the entry with the claim link flow
-- that already exists.

-- Supabase installs extensions into the `extensions` schema, so every call
-- below is schema-qualified: SET search_path = public would not find them.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── Schema ───────────────────────────────────────────────────────────────────

ALTER TABLE public.tournament_players
  ADD COLUMN IF NOT EXISTS link_requested_at TIMESTAMPTZ;

-- SELECT on this table is column-scoped (see the 2026-07-19 lockdown), so a new
-- column is invisible to clients until it is granted explicitly.
GRANT SELECT (link_requested_at) ON public.tournament_players TO anon, authenticated;

-- ── _normalise_player_name ───────────────────────────────────────────────────
-- Case, punctuation and spacing carry no signal when comparing names.

CREATE OR REPLACE FUNCTION public._normalise_player_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(COALESCE(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- ── _find_possible_duplicate_entry ───────────────────────────────────────────
-- Returns the name of the organiser-added entry most likely to be the same
-- person as p_name, or NULL. Scored, best match wins:
--
--   3.0  same name once punctuation and case are stripped
--   2.0  same first name ("Dave Smith" vs "Dave")
--   1.5  a shared surname or other token of 3+ characters
--   1.2  first names sharing a 3-character stem — catches most diminutives
--        (Dave/David, Matt/Matthew, Chris/Christopher)
--   <1   trigram similarity of the first names, which picks up typos and
--        transpositions the stem rule misses (Jonh/John)
--
-- Tuned to over-flag rather than under-flag: a false positive costs the player
-- one extra tap, a false negative costs the organiser a broken round.

CREATE OR REPLACE FUNCTION public._find_possible_duplicate_entry(
  p_tournament_id UUID,
  p_name          TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm   TEXT;
  v_first  TEXT;
  v_tokens TEXT[];
  v_match  TEXT;
BEGIN
  v_norm := public._normalise_player_name(p_name);
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  v_first := split_part(v_norm, ' ', 1);

  SELECT array_agg(tok) INTO v_tokens
  FROM unnest(string_to_array(v_norm, ' ')) AS tok
  WHERE length(tok) >= 3 AND tok <> v_first;

  SELECT scored.name INTO v_match
  FROM (
    SELECT
      c.name,
      CASE
        WHEN c.norm = v_norm THEN 3.0
        WHEN split_part(c.norm, ' ', 1) = v_first THEN 2.0
        WHEN v_tokens IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(string_to_array(c.norm, ' ')) AS t
          WHERE t = ANY (v_tokens)
        ) THEN 1.5
        WHEN length(v_first) >= 3
         AND length(split_part(c.norm, ' ', 1)) >= 3
         AND left(split_part(c.norm, ' ', 1), 3) = left(v_first, 3) THEN 1.2
        ELSE extensions.similarity(split_part(c.norm, ' ', 1), v_first)
      END AS score
    FROM (
      SELECT tp.name, public._normalise_player_name(tp.name) AS norm
      FROM public.tournament_players tp
      WHERE tp.tournament_id = p_tournament_id
        AND tp.created_by IS NOT NULL
    ) c
  ) scored
  WHERE scored.score >= 0.4
  ORDER BY scored.score DESC, scored.name
  LIMIT 1;

  RETURN v_match;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public._find_possible_duplicate_entry(UUID, TEXT) FROM PUBLIC;

-- ── request_player_entry_link ────────────────────────────────────────────────
-- "Yes, the organiser signed me up." Flags the entry so the organiser sees it
-- in Manage Players, and pushes them a notification. Creates no player row and
-- grants the caller nothing.

CREATE OR REPLACE FUNCTION public.request_player_entry_link(
  p_tournament_id UUID,
  p_entry_name    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_name      TEXT;
  v_round     INTEGER;
BEGIN
  SELECT tp.id, tp.name INTO v_player_id, v_name
  FROM public.tournament_players tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.created_by IS NOT NULL
    AND lower(tp.name) = lower(btrim(COALESCE(p_entry_name, '')))
  LIMIT 1;

  -- No such entry. Return quietly rather than erroring, so this cannot be used
  -- to probe which names are registered.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- One ping per entry per 10 minutes, so repeated taps cannot spam a running
  -- event. The flag itself stays set for the organiser to act on.
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = v_player_id
      AND link_requested_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.tournament_players
  SET link_requested_at = now()
  WHERE id = v_player_id;

  SELECT COALESCE(MAX(m.round_number), 1) INTO v_round
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id;

  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'link_request',
    'tournament_id', p_tournament_id,
    'round',         v_round,
    'player_id',     v_player_id,
    'player_name',   v_name
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_player_entry_link(UUID, TEXT)
  TO anon, authenticated;

-- ── clear_player_link_request ────────────────────────────────────────────────
-- Organiser dismisses the flag, either after linking the entry or because the
-- request was mistaken.

CREATE OR REPLACE FUNCTION public.clear_player_link_request(
  p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT tp.workspace_id INTO v_workspace_id
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can clear link requests';
  END IF;

  UPDATE public.tournament_players
  SET link_requested_at = NULL
  WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_player_link_request(UUID) TO authenticated;

-- ── self_join_tournament ─────────────────────────────────────────────────────
-- Body unchanged from 20260825150000 except the duplicate handling. The old
-- 5-argument version is dropped first: adding a parameter with a default would
-- otherwise leave two overloads and make the call ambiguous.
--
-- New output column `duplicate_of`. When it is set, NOTHING was written and
-- player_id is NULL — the caller must ask the player whether that entry is
-- them, and either send them to the organiser or re-call with
-- p_confirmed_distinct => true.

DROP FUNCTION IF EXISTS public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.self_join_tournament(
  p_tournament_id     UUID,
  p_player_name       TEXT,
  p_device_id         TEXT DEFAULT NULL,
  p_pokemon1          INTEGER DEFAULT NULL,
  p_pokemon2          INTEGER DEFAULT NULL,
  p_confirmed_distinct BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  player_id       UUID,
  device_token    TEXT,
  tournament_name TEXT,
  duplicate_of    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.tournament_players (
    tournament_id, workspace_id, name, device_token, device_id,
    deck_pokemon1, deck_pokemon2, user_id, is_late_entry, late_entry_round
  )
  VALUES (
    p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    p_pokemon1, p_pokemon2,
    auth.uid(),  -- NULL for anonymous, user id for authenticated (auto-link)
    v_is_late_entry,
    CASE WHEN v_is_late_entry THEN v_current_round ELSE NULL END
  )
  RETURNING id INTO v_player_id;

  IF v_is_late_entry THEN
    PERFORM public._apply_late_entry_pairing_unchecked(v_player_id, p_tournament_id);
  END IF;

  RETURN QUERY SELECT
    v_player_id, v_device_token, v_tournament_name::TEXT, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN)
  TO anon, authenticated;
