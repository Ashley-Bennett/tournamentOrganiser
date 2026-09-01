-- ============================================================
-- Remembering "not the same" (2026-09-01) — Phase 10b
--
-- Dismissing a suggested duplicate only lived in component state, so
-- every refresh brought the same pair back. Two players with genuinely
-- similar names would be re-offered forever, and the only way to make
-- the list quiet was to merge people who are not the same person.
--
-- Dismissals are now stored, and both decisions are reversible from the
-- player themselves: a merge undoes via workspace_player_links, and a
-- dismissal undoes by deleting its row here.
--
-- Keyed on the identity pair rather than on entries. If one side is
-- later merged away its key stops existing, the row simply stops
-- matching, and the pair can be re-evaluated — which is the behaviour
-- we want, because the thing that was judged different no longer
-- exists in the form it was judged in.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspace_player_merge_dismissals (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key_a        TEXT NOT NULL,
  key_b        TEXT NOT NULL,
  created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key_a, key_b),
  -- Canonical ordering, so (A,B) and (B,A) cannot both exist and a lookup
  -- never has to check both directions.
  CONSTRAINT workspace_player_merge_dismissals_key_order CHECK (key_a < key_b)
);

ALTER TABLE public.workspace_player_merge_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merge_dismissals_select_member"
  ON public.workspace_player_merge_dismissals;
CREATE POLICY "merge_dismissals_select_member"
  ON public.workspace_player_merge_dismissals FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- get_workspace_merge_suggestions — now hides dismissed pairs.
-- Body otherwise unchanged from 20260901011200.
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
    -- a.k < b.k gives each pair once, in the same order the dismissal
    -- table stores them.
    ON a.k < b.k
   AND NOT (a.linked AND b.linked)
  WHERE extensions.similarity(LOWER(a.nm), LOWER(b.nm)) >= p_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_player_merge_dismissals d
      WHERE d.workspace_id = p_workspace_id
        AND d.key_a = a.k
        AND d.key_b = b.k
    )
  ORDER BY sim DESC, a.nm
  LIMIT 100;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- dismiss_merge_suggestion / restore_merge_suggestion
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dismiss_merge_suggestion(
  p_workspace_id UUID,
  p_key_a        TEXT,
  p_key_b        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lo  TEXT := LEAST(p_key_a, p_key_b);
  v_hi  TEXT := GREATEST(p_key_a, p_key_b);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can dismiss duplicate suggestions';
  END IF;
  IF v_lo = v_hi THEN
    RAISE EXCEPTION 'A player cannot be marked as not the same as themselves';
  END IF;

  INSERT INTO public.workspace_player_merge_dismissals
    (workspace_id, key_a, key_b, created_by)
  VALUES (p_workspace_id, v_lo, v_hi, v_uid)
  ON CONFLICT (workspace_id, key_a, key_b) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_merge_suggestion(
  p_workspace_id UUID,
  p_key_a        TEXT,
  p_key_b        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can restore duplicate suggestions';
  END IF;

  DELETE FROM public.workspace_player_merge_dismissals
  WHERE workspace_id = p_workspace_id
    AND key_a = LEAST(p_key_a, p_key_b)
    AND key_b = GREATEST(p_key_a, p_key_b);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_workspace_player_dismissals
--
-- Who this player has been marked as "not the same" as, so the decision can be
-- reviewed and reversed from the player rather than only from the suggestion
-- list — which by design no longer shows it.
--
-- Names are resolved live, so a counterpart that has since been merged away
-- reports no name and the caller can show the row as stale.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_player_dismissals(
  p_workspace_id UUID,
  p_identity_key TEXT
)
RETURNS TABLE(
  other_key    TEXT,
  other_name   TEXT,
  other_events INT
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
      COUNT(DISTINCT i.tournament_id)::INT AS events
    FROM public.workspace_player_identities(p_workspace_id) i
    GROUP BY i.identity_key
  ),
  pairs AS (
    SELECT CASE WHEN d.key_a = p_identity_key THEN d.key_b ELSE d.key_a END AS other
    FROM public.workspace_player_merge_dismissals d
    WHERE d.workspace_id = p_workspace_id
      AND p_identity_key IN (d.key_a, d.key_b)
  )
  SELECT pr.other, p.nm, COALESCE(p.events, 0)
  FROM pairs pr
  LEFT JOIN people p ON p.k = pr.other
  ORDER BY p.nm NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_merge_suggestion(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_merge_suggestion(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_player_dismissals(UUID, TEXT) TO authenticated;
