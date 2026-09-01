import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Typography,
} from "@mui/material";
import { supabase } from "../supabaseClient";
import StatsTable, { type StatsColumn } from "./StatsTable";

/**
 * How the events themselves are running, as opposed to how the players are
 * doing: round length against the timer, where people drop, and who is
 * actually entering results.
 */

interface RoundRow {
  round_number: number;
  events: number;
  matches: number;
  timed_matches: number;
  median_minutes: number | null;
  longest_minutes: number | null;
  round_minutes: number | null;
  clock_pct: number | null;
  drops_at_round: number;
}

interface PaceRow {
  identity_key: string;
  display_name: string;
  is_linked: boolean;
  timed_matches: number;
  median_minutes: number | null;
  fastest_minutes: number | null;
  slowest_minutes: number | null;
  clock_pct: number | null;
  went_to_time: number;
}

interface ReportingStats {
  total_results: number;
  player_reported: number;
  organiser_entered: number;
  unattributed: number;
  reports_submitted: number;
  awaiting_confirmation: number;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

export default function EventHealthSection({
  workspaceId,
  gameId,
  periodArgsValue,
}: {
  workspaceId: string;
  gameId: string | null;
  periodArgsValue: { p_from: string | null; p_to: string | null };
}) {
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(true);
  const [reporting, setReporting] = useState<ReportingStats | null>(null);
  const [reportingLoading, setReportingLoading] = useState(true);
  const [pace, setPace] = useState<PaceRow[]>([]);
  const [paceLoading, setPaceLoading] = useState(true);

  const { p_from, p_to } = periodArgsValue;

  useEffect(() => {
    setRoundsLoading(true);
    void supabase
      .rpc("get_organiser_round_health", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId,
      })
      .then(({ data }) => {
        setRounds((data ?? []) as RoundRow[]);
        setRoundsLoading(false);
      });
  }, [workspaceId, gameId, p_from, p_to]);

  useEffect(() => {
    setReportingLoading(true);
    void supabase
      .rpc("get_organiser_reporting_health", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId,
      })
      .then(({ data }) => {
        setReporting(data && data.length > 0 ? (data[0] as ReportingStats) : null);
        setReportingLoading(false);
      });
  }, [workspaceId, gameId, p_from, p_to]);

  useEffect(() => {
    setPaceLoading(true);
    void supabase
      .rpc("get_organiser_player_pace", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId,
        p_min_matches: 3,
      })
      .then(({ data }) => {
        setPace((data ?? []) as PaceRow[]);
        setPaceLoading(false);
      });
  }, [workspaceId, gameId, p_from, p_to]);

  const anyTimed = rounds.some((r) => r.timed_matches > 0);
  const totalDrops = rounds.reduce((s, r) => s + r.drops_at_round, 0);

  const roundColumns: StatsColumn<RoundRow>[] = useMemo(
    () => [
      {
        key: "round",
        label: "Round",
        sortValue: (r) => r.round_number,
        render: (r) => (
          <Typography variant="body2" fontWeight={600}>
            {r.round_number}
          </Typography>
        ),
      },
      {
        key: "matches",
        label: "Matches",
        sortValue: (r) => r.matches,
        render: (r) => (
          <Typography variant="body2">
            {r.matches}
            {r.timed_matches < r.matches && (
              <Typography component="span" variant="caption" color="text.disabled">
                {" "}
                ({r.timed_matches} timed)
              </Typography>
            )}
          </Typography>
        ),
      },
      {
        key: "median",
        label: "Typical game",
        sortValue: (r) => r.median_minutes,
        render: (r) => (
          <Typography variant="body2" fontWeight={600}>
            {r.median_minutes != null ? `${r.median_minutes} min` : "—"}
          </Typography>
        ),
      },
      {
        key: "clock",
        label: "Of the clock",
        sortValue: (r) => r.clock_pct,
        render: (r) => (
          <Typography
            variant="body2"
            // Past 90% the round is effectively running to time, which is the
            // signal that the timer is too short rather than a nice-to-know.
            color={
              r.clock_pct == null
                ? "text.disabled"
                : r.clock_pct >= 90
                  ? "error.main"
                  : r.clock_pct >= 75
                    ? "warning.main"
                    : "text.primary"
            }
          >
            {r.clock_pct != null ? `${r.clock_pct}%` : "—"}
          </Typography>
        ),
      },
      {
        key: "longest",
        label: "Longest game",
        sortValue: (r) => r.longest_minutes,
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {r.longest_minutes != null ? `${r.longest_minutes} min` : "—"}
          </Typography>
        ),
      },
      {
        key: "roundlen",
        label: "Round length",
        sortValue: (r) => r.round_minutes,
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {r.round_minutes != null ? `${r.round_minutes} min` : "—"}
          </Typography>
        ),
      },
      {
        key: "drops",
        label: "Drops",
        sortValue: (r) => r.drops_at_round,
        render: (r) => (
          <Typography
            variant="body2"
            color={r.drops_at_round > 0 ? "error.main" : "text.secondary"}
          >
            {r.drops_at_round}
          </Typography>
        ),
      },
    ],
    [],
  );

  const paceColumns: StatsColumn<PaceRow>[] = useMemo(
    () => [
      {
        key: "player",
        label: "Player",
        sortValue: (r) => r.display_name.toLowerCase(),
        render: (r) => <Typography variant="body2">{r.display_name}</Typography>,
      },
      {
        key: "clock",
        label: "Of the clock",
        sortValue: (r) => r.clock_pct,
        render: (r) => (
          <Typography
            variant="body2"
            fontWeight={600}
            color={
              r.clock_pct == null
                ? "text.disabled"
                : r.clock_pct >= 90
                  ? "error.main"
                  : r.clock_pct >= 75
                    ? "warning.main"
                    : "text.primary"
            }
          >
            {r.clock_pct != null ? `${r.clock_pct}%` : "—"}
          </Typography>
        ),
      },
      {
        key: "median",
        label: "Typical game",
        sortValue: (r) => r.median_minutes,
        render: (r) => (
          <Typography variant="body2">
            {r.median_minutes != null ? `${r.median_minutes} min` : "—"}
          </Typography>
        ),
      },
      {
        key: "range",
        label: "Fastest / longest",
        sortValue: (r) => r.fastest_minutes,
        csvValue: (r) => `${r.fastest_minutes ?? ""}-${r.slowest_minutes ?? ""}`,
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {r.fastest_minutes != null ? `${r.fastest_minutes}` : "—"} /{" "}
            {r.slowest_minutes != null ? `${r.slowest_minutes} min` : "—"}
          </Typography>
        ),
      },
      {
        key: "totime",
        label: "Went to time",
        sortValue: (r) => r.went_to_time,
        render: (r) => (
          <Typography variant="body2" color={r.went_to_time > 0 ? "warning.main" : "text.secondary"}>
            {r.went_to_time} of {r.timed_matches}
          </Typography>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Results entered by the desk
              </Typography>
              {reportingLoading ? (
                <Skeleton variant="text" width={64} height={40} />
              ) : (
                <>
                  <Typography variant="h4" fontWeight={700}>
                    {reporting ? pct(reporting.organiser_entered, reporting.total_results) : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {reporting
                      ? `${reporting.organiser_entered} of ${reporting.total_results}`
                      : ""}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Reported by players
              </Typography>
              {reportingLoading ? (
                <Skeleton variant="text" width={64} height={40} />
              ) : (
                <>
                  <Typography variant="h4" fontWeight={700} color="success.main">
                    {reporting ? pct(reporting.player_reported, reporting.total_results) : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {reporting ? `${reporting.player_reported} results` : ""}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Awaiting confirmation
              </Typography>
              {reportingLoading ? (
                <Skeleton variant="text" width={64} height={40} />
              ) : (
                <>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    color={
                      reporting && reporting.awaiting_confirmation > 0
                        ? "warning.main"
                        : "text.primary"
                    }
                  >
                    {reporting?.awaiting_confirmation ?? "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Player reports not yet confirmed
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Drop-outs mid-event
              </Typography>
              {roundsLoading ? (
                <Skeleton variant="text" width={64} height={40} />
              ) : (
                <>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    color={totalDrops > 0 ? "error.main" : "text.primary"}
                  >
                    {totalDrops}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Across all rounds
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {!roundsLoading && rounds.length > 0 && !anyTimed && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No game timings for these events yet. Timing started being recorded on 1 September
          2026 — run a round from Begin Round through to the next round and these will fill in.
        </Alert>
      )}

      <StatsTable
        rows={rounds}
        columns={roundColumns}
        getRowKey={(r) => String(r.round_number)}
        initialSort={{ key: "round", dir: "asc" }}
        loading={roundsLoading}
        csvFilename={`matchamp-round-health-${new Date().toISOString().slice(0, 10)}`}
        emptyMessage="No rounds have been played in this period yet."
      />

      {(paceLoading || pace.length > 0) && (
        <>
          <Typography variant="overline" color="text.secondary" display="block" mt={3} mb={0.25}>
            Player pace
          </Typography>
          <Typography variant="body2" color="text.disabled" mb={1.5}>
            How much of the clock each player typically uses. Players with at least three timed
            games, slowest first.
          </Typography>
          <StatsTable
            rows={pace}
            columns={paceColumns}
            getRowKey={(r) => r.identity_key}
            initialSort={{ key: "clock", dir: "desc" }}
            loading={paceLoading}
            emptyMessage="Not enough timed games yet."
            maxRows={10}
            csvFilename={`matchamp-player-pace-${new Date().toISOString().slice(0, 10)}`}
          />
        </>
      )}
    </>
  );
}
