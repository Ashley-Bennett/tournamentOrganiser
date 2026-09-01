import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Typography,
} from "@mui/material";
import { supabase } from "../supabaseClient";

/**
 * How the events themselves are running, as opposed to how the players are
 * doing: round length against the timer, where people drop, and who is
 * actually entering results.
 */

interface RoundRow {
  round_number: number;
  events: number;
  matches: number;
  timed_rounds: number;
  avg_minutes: number | null;
  median_minutes: number | null;
  drops_at_round: number;
}

interface ReportingStats {
  total_results: number;
  player_reported: number;
  organiser_entered: number;
  unattributed: number;
  reports_submitted: number;
  awaiting_confirmation: number;
}

const CELL: React.CSSProperties = { padding: "10px 12px" };
const HEAD: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 12px",
  borderBottom: "1px solid rgba(128,128,128,0.3)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 600,
};

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

  const anyTimed = rounds.some((r) => r.timed_rounds > 0);
  const totalDrops = rounds.reduce((s, r) => s + r.drops_at_round, 0);

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
          Round timings aren&apos;t available for these events. A round only counts towards the
          average if it ran between one minute and twelve hours — anything longer is usually a
          tournament that was left open rather than a round that really took that long.
        </Alert>
      )}

      {roundsLoading ? (
        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1 }} />
      ) : rounds.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No rounds have been played in this period yet.
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={HEAD}>Round</th>
                <th style={HEAD}>Events</th>
                <th style={HEAD}>Matches</th>
                <th style={HEAD}>Typical length</th>
                <th style={HEAD}>Average</th>
                <th style={HEAD}>Drops</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr
                  key={r.round_number}
                  style={{ borderBottom: "1px solid rgba(128,128,128,0.15)" }}
                >
                  <td style={CELL}>
                    <Typography variant="body2" fontWeight={600}>
                      {r.round_number}
                    </Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2">{r.events}</Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2">{r.matches}</Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2">
                      {r.median_minutes != null ? `${r.median_minutes} min` : "—"}
                    </Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2" color="text.secondary">
                      {r.avg_minutes != null
                        ? `${r.avg_minutes} min over ${r.timed_rounds} round${
                            r.timed_rounds === 1 ? "" : "s"
                          }`
                        : "—"}
                    </Typography>
                  </td>
                  <td style={CELL}>
                    <Typography
                      variant="body2"
                      color={r.drops_at_round > 0 ? "error.main" : "text.secondary"}
                    >
                      {r.drops_at_round}
                    </Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </>
  );
}
