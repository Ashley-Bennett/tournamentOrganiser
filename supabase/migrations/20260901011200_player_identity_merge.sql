-- ============================================================
-- Manual player identity corrections (2026-09-01) — Phase 10
--
-- workspace_player_identities guesses who is who: an account when the
-- entry has one, otherwise the account the same name is linked to
-- elsewhere, otherwise the normalised name. That guess is wrong in two
-- opposite ways, and both need fixing by hand:
--
--   * SPLIT — one person entered as "Dave", "Dave S" and "dave smtih"
--     counts as three people, deflating their attendance and inflating
--     the unique-player count.
--   * FUSED — two different Daves entered as "Dave" count as one,
--     giving one of them the other's record.
--
-- One override table handles both, because it is keyed on the ENTRY
-- rather than on the identity. Keying it on the identity would make the
-- fused case unfixable: both Daves share a key, so there would be
-- nothing to tell them apart by.
--
-- Overrides win over every automatic rule. The organiser looking at the
-- room knows better than the name matching does.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspace_player_links (
  tournament_player_id UUID PRIMARY KEY
    REFERENCES public.tournament_players(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- The identity this entry should belong to. Either an existing key
  -- (an account UUID or 'name:…') or a fresh 'manual:<uuid>' for an entry
  -- being separated out into its own person.
  canonical_key TEXT NOT NULL,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_player_links_workspace
  ON public.workspace_player_links (workspace_id);

ALTER TABLE public.workspace_player_links ENABLE ROW LEVEL SECURITY;

-- Members read; writes go through the SECURITY DEFINER RPCs below only.
DROP POLICY IF EXISTS "workspace_player_links_select_member" ON public.workspace_player_links;
CREATE POLICY "workspace_player_links_select_member"
  ON public.workspace_player_links FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- workspace_player_identities — now applies the overrides.
--
-- Body is otherwise unchanged from 20260901010000. is_linked is derived from
-- the final key rather than from the entry, so an entry merged into someone's
-- account correctly reports as linked, and one split off into a manual person
-- correctly does not.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workspace_player_identities(
  p_workspace_id UUID
)
RETURNS TABLE(
  tournament_player_id UUID,
  tournament_id        UUID,
  identity_key         TEXT,
  display_name         TEXT,
  is_linked            BOOLEAN,
  played_at            TIMESTAMPTZ,
  game_id              TEXT,
  dropped              BOOLEAN,
  is_late_entry        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT
      tp.id,
      tp.tournament_id,
      tp.user_id,
      tp.name,
      LOWER(BTRIM(tp.name))               AS norm_name,
      COALESCE(t.starts_at, t.created_at) AS played_at,
      t.game_id,
      tp.dropped,
      tp.is_late_entry
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE t.workspace_id = p_workspace_id
      AND t.status <> 'draft'
  ),
  name_to_user AS (
    SELECT
      e.norm_name,
      (ARRAY_AGG(DISTINCT e.user_id))[1] AS user_id
    FROM entries e
    WHERE e.user_id IS NOT NULL
    GROUP BY e.norm_name
    HAVING COUNT(DISTINCT e.user_id) = 1
  ),
  keyed AS (
    SELECT
      e.*,
      COALESCE(
        l.canonical_key,
        e.user_id::TEXT,
        ntu.user_id::TEXT,
        'name:' || e.norm_name
      ) AS resolved_key
    FROM entries e
    LEFT JOIN name_to_user ntu ON ntu.norm_name = e.norm_name
    LEFT JOIN public.workspace_player_links l ON l.tournament_player_id = e.id
  ),
  labelled AS (
    SELECT
      k.*,
      FIRST_VALUE(k.name) OVER (
        PARTITION BY k.resolved_key
        -- An entry whose own name IS the identity's name wins. Otherwise
        -- merging "Dave S" and "Dve" into "Dave" would show the person as
        -- whichever variant they entered most recently — quite possibly the
        -- typo the organiser just merged away. Failing that, most recent
        -- wins, so someone correcting their own spelling still updates.
        ORDER BY
          CASE WHEN 'name:' || k.norm_name = k.resolved_key THEN 0 ELSE 1 END,
          k.played_at DESC,
          k.id DESC
      ) AS resolved_display_name
    FROM keyed k
  )
  SELECT
    l.id,
    l.tournament_id,
    l.resolved_key,
    l.resolved_display_name,
    -- A key that is neither a name nor a manual id is an account UUID.
    l.resolved_key NOT LIKE 'name:%' AND l.resolved_key NOT LIKE 'manual:%',
    l.played_at,
    l.game_id,
    l.dropped,
    l.is_late_entry
  FROM labelled l;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_workspace_merge_suggestions
--
-- Likely duplicates, by trigram similarity of the display names. pg_trgm lives
-- in the `extensions` schema on Supabase, so it must be called qualified —
-- unqualified it fails under SET search_path = public.
--
-- Only suggests pairs where at least one side is name-matched: two entries that
-- both carry real accounts are two real people, however alike their names.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_merge_suggestions(
  p_workspace_id UUID,
  p_threshold    REAL DEFAULT 0.4
)
RETURNS TABLE(
  key_a       TEXT,
  name_a      TEXT,
  events_a    INT,
  linked_a    BOOLEAN,
  key_b       TEXT,
  name_b      TEXT,
  events_b    INT,
  linked_b    BOOLEAN,
  similarity  REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT
      i.identity_key AS k,
      MAX(i.display_name) AS nm,
      BOOL_OR(i.is_linked) AS linked,
      COUNT(DISTINCT i.tournament_id)::INT AS events
    FROM public.workspace_player_identities(p_workspace_id) i
    GROUP BY i.identity_key
  )
  SELECT
    a.k, a.nm, a.events, a.linked,
    b.k, b.nm, b.events, b.linked,
    extensions.similarity(LOWER(a.nm), LOWER(b.nm)) AS sim
  FROM people a
  JOIN people b
    -- a.k < b.k gives each pair once, in a stable order.
    ON a.k < b.k
   AND NOT (a.linked AND b.linked)
  WHERE extensions.similarity(LOWER(a.nm), LOWER(b.nm)) >= p_threshold
  ORDER BY sim DESC, a.nm
  LIMIT 100;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- merge_workspace_players
--
-- Points every entry currently resolving to any of p_source_keys at
-- p_target_key. Owner/admin only: a merge rewrites attendance, the league and
-- the meta share for everyone looking at the workspace.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.merge_workspace_players(
  p_workspace_id UUID,
  p_source_keys  TEXT[],
  p_target_key   TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_target   TEXT;
  v_affected INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can merge players';
  END IF;
  IF p_target_key = ANY(p_source_keys) THEN
    RAISE EXCEPTION 'Cannot merge a player into themselves';
  END IF;

  -- Follow one hop if the target has itself been merged, so a chain of merges
  -- collapses to a single canonical key rather than leaving a dangling pointer.
  SELECT COALESCE(MAX(l.canonical_key), p_target_key) INTO v_target
  FROM public.workspace_player_identities(p_workspace_id) i
  JOIN public.workspace_player_links l ON l.tournament_player_id = i.tournament_player_id
  WHERE i.identity_key = p_target_key;

  WITH affected AS (
    SELECT i.tournament_player_id AS tpid
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE i.identity_key = ANY(p_source_keys)
  )
  INSERT INTO public.workspace_player_links
    (tournament_player_id, workspace_id, canonical_key, created_by)
  SELECT a.tpid, p_workspace_id, v_target, v_uid
  FROM affected a
  ON CONFLICT (tournament_player_id)
  DO UPDATE SET canonical_key = EXCLUDED.canonical_key,
                created_by    = EXCLUDED.created_by,
                created_at    = now();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- split_workspace_player_entries
--
-- Moves specific entries onto their own identity. This is the fix for two
-- people sharing a name: pick the entries belonging to one of them and they
-- become a separate person, named from their most recent entry.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.split_workspace_player_entries(
  p_workspace_id UUID,
  p_entry_ids    UUID[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT := 'manual:' || gen_random_uuid()::TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can separate players';
  END IF;

  INSERT INTO public.workspace_player_links
    (tournament_player_id, workspace_id, canonical_key, created_by)
  SELECT tp.id, p_workspace_id, v_key, v_uid
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.id = ANY(p_entry_ids)
    -- Scoped to the workspace so an id from elsewhere cannot be dragged in.
    AND t.workspace_id = p_workspace_id
  ON CONFLICT (tournament_player_id)
  DO UPDATE SET canonical_key = EXCLUDED.canonical_key,
                created_by    = EXCLUDED.created_by,
                created_at    = now();

  RETURN v_key;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- unlink_workspace_player_entries
-- Drops the manual overrides for these entries, returning them to whatever the
-- automatic rules say. The undo for both of the above.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unlink_workspace_player_entries(
  p_workspace_id UUID,
  p_entry_ids    UUID[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can undo player merges';
  END IF;

  DELETE FROM public.workspace_player_links
  WHERE workspace_id = p_workspace_id
    AND tournament_player_id = ANY(p_entry_ids);

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_workspace_player_entries
-- Every entry behind one identity, so the merge dialog can show what it is
-- about to move and the split dialog can offer entries to peel off.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_player_entries(
  p_workspace_id UUID,
  p_identity_key TEXT
)
RETURNS TABLE(
  tournament_player_id UUID,
  entry_name           TEXT,
  tournament_name      TEXT,
  played_at            TIMESTAMPTZ,
  is_overridden        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  SELECT
    i.tournament_player_id,
    tp.name,
    t.name,
    i.played_at,
    l.tournament_player_id IS NOT NULL
  FROM public.workspace_player_identities(p_workspace_id) i
  JOIN public.tournament_players tp ON tp.id = i.tournament_player_id
  JOIN public.tournaments t ON t.id = i.tournament_id
  LEFT JOIN public.workspace_player_links l ON l.tournament_player_id = i.tournament_player_id
  WHERE i.identity_key = p_identity_key
  ORDER BY i.played_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_merge_suggestions(UUID, REAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_players(UUID, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_workspace_player_entries(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_workspace_player_entries(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_player_entries(UUID, TEXT) TO authenticated;
