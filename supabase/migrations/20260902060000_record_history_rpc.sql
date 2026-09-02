-- ============================================================
-- Audit log: a read path (2026-09-02)
--
-- The audit log has existed since 2026-03-08 and nothing has ever read
-- it. Its only reader was audit_log_select_own, which scopes rows to
-- the user who caused them — the wrong shape for an audit trail, and
-- useless for the question people actually have: "what happened to this
-- match?" or "who changed this player?". That absence is why the two
-- bugs fixed in 20260902040000 and 20260902050000 sat there for six
-- months: an unread log gives no feedback when it drifts.
--
-- get_record_history(table, record_id) answers the drill-down question,
-- gated on membership of the workspace that owns the record.
--
-- Authorisation resolves the workspace ONCE for the requested record,
-- not per row, and falls back to the audit payload when the record has
-- been deleted — a deleted record is exactly when its history matters
-- most, and by then the live row is gone. If neither the live table nor
-- the payload yields a workspace, access is denied rather than assumed.
--
-- match_result_reports is the awkward case: it carries no workspace_id,
-- so the workspace comes from its match, and from that match's own audit
-- history if the match is gone too.
--
-- Table names are checked against a fixed list. The function is
-- SECURITY DEFINER, so an unchecked p_table_name would be an arbitrary
-- read of any audited table's payloads.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_record_history(
  p_table_name TEXT,
  p_record_id  UUID
)
RETURNS TABLE (
  changed_at     TIMESTAMPTZ,
  operation      TEXT,
  actor          TEXT,
  actor_kind     TEXT,
  changed_fields TEXT[],
  old_data       JSONB,
  new_data       JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c_audited CONSTANT TEXT[] := ARRAY[
    'tournaments', 'tournament_players', 'tournament_matches',
    'match_result_reports', 'workspace_memberships',
    'tournament_player_claims', 'workspace_player_links'
  ];
  v_workspace_id UUID;
  v_match_id     UUID;
BEGIN
  IF NOT (p_table_name = ANY (c_audited)) THEN
    RAISE EXCEPTION 'Unknown or unaudited table: %', p_table_name;
  END IF;

  -- Resolve the owning workspace. Live row first, then the audit payload
  -- for records that have since been deleted.
  IF p_table_name = 'match_result_reports' THEN
    SELECT m.workspace_id INTO v_workspace_id
      FROM public.match_result_reports r
      JOIN public.tournament_matches m ON m.id = r.match_id
     WHERE r.id = p_record_id;

    IF v_workspace_id IS NULL THEN
      -- Report gone: recover its match_id from the report's own history,
      -- then that match's workspace, live or historical.
      SELECT COALESCE(a.new_data, a.old_data) ->> 'match_id' INTO v_match_id
        FROM public.audit_log a
       WHERE a.table_name = 'match_result_reports' AND a.record_id = p_record_id
       ORDER BY a.changed_at DESC
       LIMIT 1;

      SELECT m.workspace_id INTO v_workspace_id
        FROM public.tournament_matches m WHERE m.id = v_match_id;

      IF v_workspace_id IS NULL THEN
        SELECT (COALESCE(a.new_data, a.old_data) ->> 'workspace_id')::UUID
          INTO v_workspace_id
          FROM public.audit_log a
         WHERE a.table_name = 'tournament_matches' AND a.record_id = v_match_id
         ORDER BY a.changed_at DESC
         LIMIT 1;
      END IF;
    END IF;
  ELSE
    -- Every other audited table carries workspace_id directly.
    EXECUTE format(
      'SELECT workspace_id FROM public.%I WHERE %I = $1',
      p_table_name,
      CASE WHEN p_table_name = 'workspace_player_links'
           THEN 'tournament_player_id' ELSE 'id' END
    )
    INTO v_workspace_id
    USING p_record_id;

    IF v_workspace_id IS NULL THEN
      SELECT (COALESCE(a.new_data, a.old_data) ->> 'workspace_id')::UUID
        INTO v_workspace_id
        FROM public.audit_log a
       WHERE a.table_name = p_table_name AND a.record_id = p_record_id
       ORDER BY a.changed_at DESC
       LIMIT 1;
    END IF;
  END IF;

  IF v_workspace_id IS NULL THEN
    -- No record, or nothing left to tie it to a workspace. Same answer
    -- either way, so membership of one workspace reveals nothing about
    -- the existence of records in another.
    RETURN;
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Not authorised to view this record''s history';
  END IF;

  RETURN QUERY
  SELECT
    a.changed_at,
    a.operation,
    COALESCE(
      pr.display_name,                       -- signed-in actor
      tp.name,                               -- anonymous player, by entry
      CASE WHEN a.actor_label IS NOT NULL THEN a.actor_label END,
      'Unknown'
    )::TEXT AS actor,
    CASE
      WHEN a.user_id IS NOT NULL     THEN 'account'
      WHEN a.actor_label IS NOT NULL THEN 'player'
      ELSE 'unattributed'
    END::TEXT AS actor_kind,
    CASE
      WHEN a.operation <> 'UPDATE' THEN NULL
      ELSE (
        SELECT array_agg(k ORDER BY k)
          FROM jsonb_object_keys(a.new_data) AS k
         WHERE a.old_data -> k IS DISTINCT FROM a.new_data -> k
      )
    END AS changed_fields,
    a.old_data,
    a.new_data
  FROM public.audit_log a
  LEFT JOIN public.profiles pr
         ON pr.id = a.user_id
  LEFT JOIN public.tournament_players tp
         ON a.actor_label LIKE 'player:%'
        AND tp.id = NULLIF(substring(a.actor_label FROM 8), '')::UUID
 WHERE a.table_name = p_table_name
   AND a.record_id  = p_record_id
 ORDER BY a.changed_at DESC;
END;
$$;

-- Organisers only. The player-facing app has no use for this, and anon
-- must never reach it: the payloads describe a whole workspace's records.
REVOKE ALL ON FUNCTION public.get_record_history(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_record_history(TEXT, UUID) TO authenticated;
