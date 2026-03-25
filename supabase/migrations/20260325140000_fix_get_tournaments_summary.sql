-- Drop the original single-param overload that conflicts with the v2 version.
-- PostgREST cannot resolve between overloaded functions, so we keep only the
-- two-param version (p_tournament_ids + p_player_ids).

DROP FUNCTION IF EXISTS public.get_tournaments_summary(UUID[]);
