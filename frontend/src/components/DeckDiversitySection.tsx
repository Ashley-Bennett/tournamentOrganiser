import React, { useEffect, useMemo, useState } from "react";
import { Box, Chip, Typography } from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { supabase } from "../supabaseClient";
import { getSpriteUrl } from "../utils/pokemonCache";
import { deckName } from "../utils/deck";
import StatsTimeline, { type TimelineBucket, type TimelinePoint } from "./StatsTimeline";

/**
 * Is the meta narrowing?
 *
 * A raw count of distinct decks cannot answer that — it tracks attendance, so
 * the line just redraws the turnout chart. The bars are the *effective* deck
 * count (exp of Shannon entropy over each deck's share of the field), which
 * reads as "the field plays like N decks" and is robust to how many people
 * turned up. Narrowing shows as this falling while the distinct count holds.
 *
 * The distinct count is still shown under each bar, because the gap between
 * the two is the interesting part: 12 decks registered but an effective 7
 * means a handful dominate.
 */

interface DiversityRow {
  period_label: string;
  period_start: string;
  events: number;
  decked_entries: number;
  distinct_decks: number;
  effective_decks: number;
  top_deck_share: number;
  top_deck1: number | null;
  top_deck2: number | null;
}

/** Periods at each end used to judge the direction of travel. */
const TREND_WINDOW = 2;

export default function DeckDiversitySection({
  workspaceId,
  gameId,
  nameMap,
  periodArgsValue,
}: {
  workspaceId: string;
  gameId: string | null;
  nameMap: Map<number, string>;
  periodArgsValue: { p_from: string | null; p_to: string | null };
}) {
  const [rows, setRows] = useState<DiversityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState<TimelineBucket>("month");

  const { p_from, p_to } = periodArgsValue;

  useEffect(() => {
    setLoading(true);
    void supabase
      .rpc("get_organiser_deck_diversity", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId,
        p_bucket: bucket,
      })
      .then(({ data }) => {
        setRows((data ?? []) as DiversityRow[]);
        setLoading(false);
      });
  }, [workspaceId, gameId, p_from, p_to, bucket]);

  const points: TimelinePoint[] = useMemo(
    () =>
      rows.map((r) => ({
        key: r.period_start,
        label: r.period_label,
        value: r.effective_decks,
        display: String(r.effective_decks),
        sub: `of ${r.distinct_decks}`,
      })),
    [rows],
  );

  // Judged on the share the top deck takes, not on the effective count: the
  // effective count still drifts with field size, whereas a share does not.
  const trend = useMemo(() => {
    if (rows.length < TREND_WINDOW * 2) return null;
    const mean = (xs: DiversityRow[]) =>
      xs.reduce((s, r) => s + Number(r.top_deck_share), 0) / xs.length;
    const older = mean(rows.slice(0, TREND_WINDOW));
    const recent = mean(rows.slice(-TREND_WINDOW));
    const delta = recent - older;
    if (Math.abs(delta) < 5) return null;
    return { narrowing: delta > 0, delta: Math.abs(delta) };
  }, [rows]);

  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const latestTopDeck =
    latest && (latest.top_deck1 != null || latest.top_deck2 != null)
      ? deckName({ deck_pokemon1: latest.top_deck1, deck_pokemon2: latest.top_deck2 }, nameMap)
      : null;

  return (
    <>
      {!loading && rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          Bars show how many decks the field effectively plays like, out of how many were
          actually registered. The closer the two, the more evenly spread the meta.
        </Typography>
      )}

      <StatsTimeline
        points={points}
        loading={loading}
        emptyMessage="No decks registered in this period yet."
        bucket={bucket}
        onBucketChange={setBucket}
      />

      {!loading && rows.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={0.75} mt={1.5} alignItems="center">
          {rows.slice(-6).map((r) => (
            <Chip
              key={r.period_start}
              size="small"
              variant="outlined"
              icon={
                r.top_deck1 != null ? (
                  <img
                    src={getSpriteUrl(r.top_deck1)}
                    alt=""
                    style={{ width: 18, height: 18, imageRendering: "pixelated" }}
                  />
                ) : undefined
              }
              label={`${r.period_label}: top deck ${r.top_deck_share}%`}
            />
          ))}
        </Box>
      )}

      {!loading && trend && (
        <Box display="flex" alignItems="center" gap={1} mt={1.5}>
          {trend.narrowing ? (
            <TrendingDownIcon fontSize="small" color="warning" />
          ) : (
            <TrendingUpIcon fontSize="small" color="success" />
          )}
          <Typography
            variant="body2"
            color={trend.narrowing ? "warning.main" : "success.main"}
          >
            {trend.narrowing
              ? `The meta is concentrating — the most-played deck now takes ${trend.delta.toFixed(0)}% more of the field than it did.`
              : `The meta is opening up — the most-played deck takes ${trend.delta.toFixed(0)}% less of the field than it did.`}
          </Typography>
        </Box>
      )}

      {!loading && latest && latestTopDeck && (
        <Typography variant="caption" color="text.disabled" display="block" mt={1}>
          Most played in {latest.period_label}: {latestTopDeck} at {latest.top_deck_share}% of{" "}
          {latest.decked_entries} entries.
        </Typography>
      )}
    </>
  );
}
