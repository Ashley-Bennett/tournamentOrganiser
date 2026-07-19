-- ============================================================
-- Security lockdown (audit findings, 2026-07-19)
--
-- 1. tournament_players.device_token is the sole credential for
--    the device-authenticated player RPCs (submit_match_result,
--    set_player_deck, self_claim_player_entry). The RLS SELECT
--    policies on tournament_players are row-level only, so any
--    role that could read a row (anon via the public-tournament
--    policy, any workspace member via the member policy) could
--    also read every player's device_token through PostgREST or
--    realtime — enabling full player impersonation and account
--    hijack via self_claim_player_entry.
--
--    Postgres column privileges are additive, so the fix is to
--    revoke the table-level SELECT grant and re-grant an explicit
--    column list that excludes device_token and device_id.
--    SECURITY DEFINER RPCs run as the table owner and are
--    unaffected; realtime (walrus) also honours column grants, so
--    REPLICA IDENTITY FULL payloads no longer include the token.
--
--    NOTE: because the SELECT grant is now column-scoped, any
--    future ALTER TABLE public.tournament_players ADD COLUMN must
--    be paired with GRANT SELECT (new_column) TO anon,
--    authenticated — otherwise clients cannot read it.
--
-- 2. purge_unclaimed_player_entries() and cleanup_audit_log()
--    are SECURITY DEFINER maintenance helpers with no internal
--    auth check. The default EXECUTE grant meant any caller —
--    including anon — could delete every unclaimed player entry
--    (p_days => 0) or wipe the audit log via /rest/v1/rpc/.
--    Revoke EXECUTE from client roles; run them from the
--    dashboard / service_role when maintenance is actually needed.
-- ============================================================

-- ---- 1. Hide device credential columns ----------------------

REVOKE SELECT ON public.tournament_players FROM anon, authenticated;

GRANT SELECT (
  id,
  tournament_id,
  name,
  created_by,
  created_at,
  dropped,
  dropped_at_round,
  has_static_seating,
  static_seat_number,
  workspace_id,
  user_id,
  is_late_entry,
  late_entry_round,
  deck_pokemon1,
  deck_pokemon2
) ON public.tournament_players TO anon, authenticated;

-- ---- 2. Lock down maintenance RPCs --------------------------

REVOKE EXECUTE ON FUNCTION public.purge_unclaimed_player_entries(INTEGER)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_audit_log(INTEGER)
  FROM PUBLIC, anon, authenticated;
