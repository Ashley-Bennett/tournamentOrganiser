import React from "react";
import { Alert, Box, Card, CardContent, Chip, Grid, Skeleton, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import { getSpriteUrl } from "../utils/pokemonCache";
import { deckName } from "../utils/deck";
import { TIMINGS_START_LABEL } from "../utils/timing";
import { useStatsRpcRow } from "../hooks/useStatsRpc";

/**
 * How long the player's games actually take.
 *
 * Measured from when the round started to when the result was recorded, less
 * any time the round was paused. That includes walking to the desk, so it reads
 * a little long — it is a pace measure, not a stopwatch, and the caption says
 * so rather than implying more precision than there is.
 *
 * Only games played from `TIMINGS_START_LABEL` onwards have timings at all, so
 * the section leads with how many matches it is describing.
 */

interface PaceStats {
  timed_matches: number;
  median_minutes: number | null;
  clock_pct: number | null;
  went_to_time: number;
  fastest_minutes: number | null;
  fastest_event: string | null;
  fastest_opponent: string | null;
  fastest_deck1: number | null;
  fastest_deck2: number | null;
  fastest_won: boolean | null;
  slowest_minutes: number | null;
  slowest_event: string | null;
  slowest_opponent: string | null;
}

/** "2.8" minutes reads badly; "2m 48s" is what a player would say. */
function formatMinutes(mins: number | null): string {
  if (mins == null) return "—";
  const total = Math.round(mins * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function StatCard({
  label,
  value,
  sub,
  loading,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ pb: "16px !important" }}>
        <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
          {icon}
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
        </Box>
        {loading ? (
          <Skeleton variant="text" width={72} height={40} />
        ) : (
          <>
            <Typography variant="h5" fontWeight={700} color={color ?? "text.primary"}>
              {value}
            </Typography>
            {sub && (
              <Typography variant="caption" color="text.secondary">
                {sub}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlayerPaceSection({
  periodArgsValue,
  gameId,
  nameMap,
}: {
  periodArgsValue: { p_from: string | undefined; p_to: string | undefined };
  gameId: string | null;
  nameMap: Map<number, string>;
}) {
  const { p_from, p_to } = periodArgsValue;

  const {
    row: data,
    loading,
    error,
  } = useStatsRpcRow<PaceStats>(
    "get_player_game_pace",
    { p_from, p_to, p_game_id: gameId },
    [p_from, p_to, gameId],
  );

  const timed = data?.timed_matches ?? 0;

  if (error) {
    return <Alert severity="error">Could not load your game pace: {error}</Alert>;
  }

  if (!loading && timed === 0) {
    return (
      <Alert severity="info">
        No timed games yet. Game timings started being recorded on {TIMINGS_START_LABEL}. Play a
        round that the organiser starts with the round timer and this will fill in.
      </Alert>
    );
  }

  const fastestDeck =
    data && (data.fastest_deck1 != null || data.fastest_deck2 != null)
      ? deckName({ deck_pokemon1: data.fastest_deck1, deck_pokemon2: data.fastest_deck2 }, nameMap)
      : null;

  return (
    <>
      {!loading && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          Across {timed} timed game{timed === 1 ? "" : "s"}. Measured from the round starting to your
          result being recorded, so it includes getting to the desk.
        </Typography>
      )}

      <Grid container spacing={2} mb={2}>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Typical game"
            value={formatMinutes(data?.median_minutes ?? null)}
            sub={data?.clock_pct != null ? `${data.clock_pct}% of the clock` : undefined}
            loading={loading}
            color="info.main"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Fastest game"
            value={formatMinutes(data?.fastest_minutes ?? null)}
            sub={data?.fastest_event ?? undefined}
            loading={loading}
            color="success.main"
            icon={<BoltIcon fontSize="small" color="success" />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Longest game"
            value={formatMinutes(data?.slowest_minutes ?? null)}
            sub={data?.slowest_event ?? undefined}
            loading={loading}
            icon={<HourglassBottomIcon fontSize="small" />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Went to time"
            value={String(data?.went_to_time ?? 0)}
            sub="Games using 95%+ of the clock"
            loading={loading}
            color={data && data.went_to_time > 0 ? "warning.main" : undefined}
          />
        </Grid>
      </Grid>

      {!loading && data?.fastest_minutes != null && (
        <Card variant="outlined">
          <CardContent sx={{ pb: "16px !important" }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.75}>
              Your fastest game
            </Typography>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body1" fontWeight={700} color="success.main">
                {formatMinutes(data.fastest_minutes)}
              </Typography>
              {data.fastest_won != null && (
                <Chip
                  size="small"
                  label={data.fastest_won ? "Win" : "Loss"}
                  color={data.fastest_won ? "success" : "default"}
                  variant="outlined"
                />
              )}
              {data.fastest_opponent && (
                <Typography variant="body2" color="text.secondary">
                  against {data.fastest_opponent}
                </Typography>
              )}
              {data.fastest_event && (
                <Typography variant="body2" color="text.secondary">
                  at {data.fastest_event}
                </Typography>
              )}
              {fastestDeck && (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    with
                  </Typography>
                  {data.fastest_deck1 != null && (
                    <img
                      src={getSpriteUrl(data.fastest_deck1)}
                      alt=""
                      style={{ width: 24, height: 24, imageRendering: "pixelated" }}
                    />
                  )}
                  <Typography variant="body2">{fastestDeck}</Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
    </>
  );
}
