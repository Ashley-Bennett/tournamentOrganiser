-- ============================================================
-- Audit log: which records actually have a history (2026-09-02)
--
-- get_record_history (20260902060000) answers "what happened to this
-- record", but the UI needs to know whether to offer the question at
-- all. Without that it shows a History control on every row, and most
-- rows have nothing but their own creation behind it — on dev, 51 of
-- 106 tournament_players audit rows are bare INSERTs. A panel that
-- opens to say "created" is noise on every player in the event.
--
-- Worse for records that predate the actor work: nothing before
-- 20260902050000 carries an actor_label, so an anonymous self-join from
-- last week renders as "Unknown created" — a row whose entire promise
-- is attribution, delivering none.
--
-- This returns, for a batch of ids, how many NON-creation events each
-- has. Records with none are simply absent from the result, so the
-- caller shows nothing for them. One round trip for a whole dialog
-- rather than one per row.
--
-- Restricted to tables carrying both id and workspace_id: a record has
-- to be live to be listed in a UI, so the workspace comes from the row
-- itself and there is no need for get_record_history's deleted-record
-- fallback. Non-members are filtered out rather than raising — this is
-- a batch, and one foreign id should not fail the whole call.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_record_change_counts(
  p_table_name TEXT,
  p_record_ids UUID[]
)
RETURNS TABLE (
  record_id    UUID,
  change_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c_supported CONSTANT TEXT[] := ARRAY[
    'tournaments', 'tournament_players', 'tournament_matches',
    'workspace_memberships', 'tournament_player_claims'
  ];
BEGIN
  IF NOT (p_table_name = ANY (c_supported)) THEN
    RAISE EXCEPTION 'Unknown or unsupported table: %', p_table_name;
  END IF;

  IF p_record_ids IS NULL OR array_length(p_record_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT r.id, count(*)::INTEGER
      FROM public.%I r
      JOIN public.audit_log a
        ON a.table_name = %L
       AND a.record_id  = r.id
       AND a.operation <> 'INSERT'
     WHERE r.id = ANY($1)
       AND public.is_workspace_member(r.workspace_id)
     GROUP BY r.id
  $q$, p_table_name, p_table_name)
  USING p_record_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.get_record_change_counts(TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_record_change_counts(TEXT, UUID[]) TO authenticated;
