-- ── Tell the organiser when someone joins mid-tournament ─────────────────────
-- A self-added late entry changes the current round's pairings underneath the
-- organiser: a waiting bye may have just been paired up, or a new bye created.
-- They need to know without watching the player list.
--
-- Fires only for SELF-joins (created_by IS NULL). Organiser-added late entries
-- are deliberately excluded — they already know, they just did it.
--
-- The push is delivered by the send-push Edge Function. If that function has
-- not been redeployed with the matching 'late_join' case yet, it resolves no
-- message and sends nothing, so this trigger is safe to ship on its own.

CREATE OR REPLACE FUNCTION public.notify_late_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'late_join',
    'tournament_id', NEW.tournament_id,
    'player_name',   NEW.name,
    'round',         NEW.late_entry_round
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_late_join ON public.tournament_players;
CREATE TRIGGER trg_notify_late_join
  AFTER INSERT ON public.tournament_players
  FOR EACH ROW
  WHEN (NEW.is_late_entry AND NEW.created_by IS NULL)
  EXECUTE FUNCTION public.notify_late_join();
