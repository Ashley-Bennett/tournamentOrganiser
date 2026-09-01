-- ============================================================
-- Deck diversity over time (2026-09-01) — Phase 9
--
-- "Is my meta narrowing?" A raw count of distinct decks cannot answer
-- that, because it tracks attendance: a 20-player event will always
-- show more decks than an 8-player one, so the line just redraws the
-- turnout chart.
--
-- Two field-size-robust measures instead:
--
--   * effective_decks — exp(Shannon entropy) over the share each deck
--     took of the field. It reads as "the field plays like N decks".
--     Nine decks split evenly gives 9; nine decks where one is half the
--     room gives about 4. Narrowing shows up as this falling while
--     distinct_decks stays flat, which a raw count would hide entirely.
--
--   * top_deck_share — what share of the field the single most-played
--     deck took. The blunt version of the same question, and the one an
--     organiser will quote.
--
-- distinct_decks is still returned, as the reference point the other
-- two are read against.
--
-- Entries with no deck registered are excluded rather than pooled into
-- an "unknown" deck, which would otherwise look like the most popular
-- choice in the room.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_organiser_deck_diversity(
  p_workspace_id UUID,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL,
  p_game_id      TEXT        DEFAULT NULL,
  p_bucket       TEXT        DEFAULT 'month'
)
RETURNS TABLE(
  period_label    TEXT,
  period_start    TIMESTAMPTZ,
  events          INT,
  decked_entries  INT,
  distinct_decks  INT,
  effective_decks NUMERIC,
  top_deck_share  NUMERIC,
  top_deck1       INT,
  top_deck2       INT
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

  IF p_bucket NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION 'Unsupported bucket %, expected month, quarter or year', p_bucket;
  END IF;

  RETURN QUERY
  WITH decked AS (
    SELECT
      DATE_TRUNC(p_bucket, i.played_at) AS bucket_start,
      i.tournament_id                   AS tid,
      tp.deck_pokemon1                  AS p1,
      tp.deck_pokemon2                  AS p2
    FROM public.workspace_player_identities(p_workspace_id) i
    JOIN public.tournament_players tp ON tp.id = i.tournament_player_id
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
      AND (tp.deck_pokemon1 IS NOT NULL OR tp.deck_pokemon2 IS NOT NULL)
  ),
  per_deck AS (
    SELECT d.bucket_start, d.p1, d.p2, COUNT(*)::INT AS n
    FROM decked d
    GROUP BY d.bucket_start, d.p1, d.p2
  ),
  per_bucket AS (
    SELECT
      d.bucket_start,
      COUNT(*)::INT                  AS entries,
      COUNT(DISTINCT d.tid)::INT     AS events
    FROM decked d
    GROUP BY d.bucket_start
  ),
  shannon AS (
    SELECT
      pd.bucket_start,
      COUNT(*)::INT AS n_distinct,
      -- exp(-Σ p·ln p). A period with a single deck gives ln(1)=0, so the
      -- effective count is exactly 1 rather than undefined.
      EXP(-SUM((pd.n::FLOAT / pb.entries) * LN(pd.n::FLOAT / pb.entries))) AS effective
    FROM per_deck pd
    JOIN per_bucket pb ON pb.bucket_start = pd.bucket_start
    GROUP BY pd.bucket_start
  ),
  top_deck AS (
    SELECT DISTINCT ON (pd.bucket_start)
      pd.bucket_start, pd.p1, pd.p2, pd.n
    FROM per_deck pd
    ORDER BY pd.bucket_start, pd.n DESC, pd.p1 NULLS LAST, pd.p2 NULLS LAST
  )
  SELECT
    CASE p_bucket
      WHEN 'month'   THEN TO_CHAR(pb.bucket_start, 'Mon YY')
      WHEN 'quarter' THEN 'Q' || EXTRACT(QUARTER FROM pb.bucket_start)::TEXT
                            || ' ' || TO_CHAR(pb.bucket_start, 'YY')
      ELSE TO_CHAR(pb.bucket_start, 'YYYY')
    END,
    pb.bucket_start,
    pb.events,
    pb.entries,
    s.n_distinct,
    ROUND(s.effective::NUMERIC, 1),
    ROUND((td.n::NUMERIC / pb.entries) * 100, 0),
    td.p1,
    td.p2
  FROM per_bucket pb
  JOIN shannon  s  ON s.bucket_start  = pb.bucket_start
  JOIN top_deck td ON td.bucket_start = pb.bucket_start
  ORDER BY pb.bucket_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organiser_deck_diversity(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
