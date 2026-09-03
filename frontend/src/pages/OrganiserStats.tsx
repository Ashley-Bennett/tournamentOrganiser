import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
  Button,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";
import StatsPeriodFilter from "../components/StatsPeriodFilter";
import StatsGameFilter from "../components/StatsGameFilter";
import StatsTimeline, { type TimelineBucket, type TimelinePoint } from "../components/StatsTimeline";
import LeagueTableSection from "../components/LeagueTableSection";
import MetaShareSection from "../components/MetaShareSection";
import DeckDiversitySection from "../components/DeckDiversitySection";
import EventHealthSection from "../components/EventHealthSection";
import StatsTable, { type StatsColumn } from "../components/StatsTable";
import StatsSection from "../components/StatsSection";
import { StatsDrillProvider } from "../components/StatsDrill";
import MergeSuggestions from "../components/MergeSuggestions";
import PlayerIdentityDialog, { type IdentityOption } from "../components/PlayerIdentityDialog";
import { getPokemonList } from "../utils/pokemonCache";
import { getGame } from "../games/registry";
import { ALL_TIME, periodArgs, periodLabel, type StatsPeriod } from "../utils/statsPeriod";
import type { RpcRow } from "../types/rpc";

// ── Types ──────────────────────────────────────────────────────────────────────

type OverviewStats = RpcRow<"get_organiser_overview_stats">;

type AttendanceRow = RpcRow<"get_organiser_attendance">;

type TimelineRow = RpcRow<"get_organiser_timeline">;

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

function StatCard({
  label,
  value,
  sub,
  loading,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  loading: boolean;
  color?: string;
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ pb: "16px !important" }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width={64} height={40} />
        ) : (
          <>
            <Typography variant="h4" fontWeight={700} color={color ?? "text.primary"}>
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

// ── Page ───────────────────────────────────────────────────────────────────────

const OrganiserStats: React.FC = () => {
  const { workspace, wPath, currentRole } = useWorkspace();
  const workspaceId = workspace?.id ?? null;

  const [gameIds, setGameIds] = useState<string[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Map<number, string>>(new Map());
  const [years, setYears] = useState<number[]>([]);
  const [period, setPeriod] = useState<StatsPeriod>(ALL_TIME);
  const [bucket, setBucket] = useState<TimelineBucket>("month");

  // The fetches below depend on the period as two primitives rather than on the
  // `period` object. An equal-but-new object is a different dependency as far
  // as React is concerned, so depending on the object makes every fetch on the
  // page hostage to whoever happens to construct one.
  const periodYear = period.year;
  const periodArgsValue = useMemo(() => periodArgs({ year: periodYear }), [periodYear]);
  const { p_from, p_to } = periodArgsValue;

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [playerSearch, setPlayerSearch] = useState("");
  const [openIdentity, setOpenIdentity] = useState<IdentityOption | null>(null);
  // Bumped after a merge or split so every section refetches: correcting an
  // identity changes attendance, the league and the meta share at once.
  const [identityVersion, setIdentityVersion] = useState(0);
  // The events the meta share table is describing, so a deck drill-down
  // opened from it covers the same scope.
  const [deckScope, setDeckScope] = useState<string[]>([]);

  const canEditIdentities = currentRole === "owner" || currentRole === "admin";

  const visibleAttendance = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (q === "") return attendance;
    return attendance.filter((r) => r.display_name.toLowerCase().includes(q));
  }, [attendance, playerSearch]);

  const attendanceColumns: StatsColumn<AttendanceRow>[] = useMemo(
    () => [
      {
        key: "player",
        label: "Player",
        sortValue: (r) => r.display_name.toLowerCase(),
        render: (r) => (
          <Box display="flex" alignItems="center" gap={0.75}>
            <Typography variant="body2">{r.display_name}</Typography>
            {r.is_linked && <Chip label="Account" size="small" variant="outlined" />}
          </Box>
        ),
      },
      {
        key: "events",
        label: "Events",
        sortValue: (r) => r.events_played,
        render: (r) => (
          <Typography variant="body2" fontWeight={600}>
            {r.events_played}
          </Typography>
        ),
      },
      {
        key: "matches",
        label: "Matches",
        sortValue: (r) => r.matches,
        render: (r) => <Typography variant="body2">{r.matches}</Typography>,
      },
      {
        key: "winrate",
        label: "Win rate",
        sortValue: (r) => (r.matches > 0 ? r.match_wins / r.matches : null),
        csvValue: (r) =>
          r.matches > 0 ? Number(((r.match_wins / r.matches) * 100).toFixed(1)) : null,
        render: (r) => <Typography variant="body2">{pct(r.match_wins, r.matches)}</Typography>,
      },
      {
        key: "wins",
        label: "Event wins",
        sortValue: (r) => r.event_wins,
        render: (r) => <Typography variant="body2">{r.event_wins}</Typography>,
      },
      {
        key: "top3",
        label: "Top 3",
        sortValue: (r) => r.top3_finishes,
        render: (r) => <Typography variant="body2">{r.top3_finishes}</Typography>,
      },
      {
        key: "first",
        label: "First seen",
        sortValue: (r) => new Date(r.first_played).getTime(),
        csvValue: (r) => r.first_played.slice(0, 10),
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {new Date(r.first_played).toLocaleDateString()}
          </Typography>
        ),
      },
      {
        key: "last",
        label: "Last seen",
        sortValue: (r) => new Date(r.last_played).getTime(),
        csvValue: (r) => r.last_played.slice(0, 10),
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {new Date(r.last_played).toLocaleDateString()}
          </Typography>
        ),
      },
    ],
    [],
  );

  // Deck names for the meta share table. Only fetched for a game that has
  // decks — there is nothing to name otherwise.
  const hasDecks = gameId != null && getGame(gameId).deck !== "none";

  useEffect(() => {
    if (!hasDecks) return;
    void getPokemonList().then((list) => {
      setNameMap(new Map(list.map((p) => [p.id, p.name])));
    });
  }, [hasDecks]);

  // Games this workspace has actually run, busiest first. Same rule as the
  // player page: never mix games, and hide the picker when there is only one.
  useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .rpc("get_organiser_stats_games", { p_workspace_id: workspaceId })
      .then(({ data }) => {
        const ids = (data ?? []).map((r: { game_id: string }) => r.game_id);
        setGameIds(ids);
        setGameId((current) => current ?? ids[0] ?? null);
      });
  }, [workspaceId]);

  // Years reset when the game changes — a workspace may have run Pokémon for
  // two years and chess only since last month.
  useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .rpc("get_organiser_stats_years", { p_workspace_id: workspaceId, p_game_id: gameId ?? undefined })
      .then(({ data }) => {
        const ys = (data ?? []).map((r: { year: number }) => r.year);
        setYears(ys);
        setPeriod((current) =>
          current.year != null && !ys.includes(current.year) ? ALL_TIME : current,
        );
      });
  }, [workspaceId, gameId]);

  useEffect(() => {
    if (!workspaceId) return;
    setOverviewLoading(true);
    void supabase
      .rpc("get_organiser_overview_stats", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId ?? undefined,
      })
      .then(({ data }) => {
        setOverview(data && data.length > 0 ? (data[0] as OverviewStats) : null);
        setOverviewLoading(false);
      });
  }, [workspaceId, p_from, p_to, gameId]);

  useEffect(() => {
    if (!workspaceId) return;
    setAttendanceLoading(true);
    void supabase
      .rpc("get_organiser_attendance", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId ?? undefined,
        // Deliberately generous: the table searches, sorts and pages client
        // side, so the limit only exists to bound the payload for a workspace
        // with years of history — not to decide what is worth showing.
        p_limit: 500,
      })
      .then(({ data }) => {
        setAttendance((data ?? []) as AttendanceRow[]);
        setAttendanceLoading(false);
      });
  }, [workspaceId, p_from, p_to, gameId, identityVersion]);

  useEffect(() => {
    if (!workspaceId) return;
    setTimelineLoading(true);
    void supabase
      .rpc("get_organiser_timeline", {
        p_workspace_id: workspaceId,
        p_from,
        p_to,
        p_game_id: gameId ?? undefined,
        p_bucket: bucket,
      })
      .then(({ data }) => {
        setTimeline((data ?? []) as TimelineRow[]);
        setTimelineLoading(false);
      });
  }, [workspaceId, p_from, p_to, gameId, bucket]);

  const points: TimelinePoint[] = useMemo(
    () =>
      timeline.map((r) => ({
        key: r.period_start,
        label: r.period_label,
        value: r.unique_players,
        display: String(r.unique_players),
        sub: `${r.events} event${r.events === 1 ? "" : "s"}`,
      })),
    [timeline],
  );

  // Over all time every player's first event is inside the range, so everyone
  // is "new" and the split says nothing. It only earns a card once a year is
  // picked and there is a before to be returning from.
  const showNewReturning = period.year != null;

  const nameMatched = overview ? overview.unique_players - overview.linked_players : 0;

  if (!workspaceId) {
    return (
      <Box p={3}>
        <Typography variant="body2" color="text.secondary">
          Loading workspace…
        </Typography>
      </Box>
    );
  }

  return (
    <StatsDrillProvider
      workspaceId={workspaceId}
      gameId={gameId}
      nameMap={nameMap}
      deckTournamentIds={deckScope}
    >
    {/* width:100% alongside the cap is load-bearing, not belt-and-braces. With
        max-width alone the box takes its width from its widest content, so a
        table wide enough to need its own scrollbar stretched the whole page and
        scrolled the layout sideways instead of scrolling inside the table. */}
    <Box p={{ xs: 2, sm: 3 }} sx={{ width: "100%", maxWidth: 1200, mx: "auto" }}>
      <Button
        component={Link}
        to={wPath("/dashboard")}
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ mb: 1 }}
      >
        Dashboard
      </Button>

      <Typography variant="h4" fontWeight={700} gutterBottom>
        Organiser stats
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        {workspace?.name} · {periodLabel(period)}
      </Typography>

      <StatsGameFilter gameIds={gameIds} value={gameId} onChange={setGameId} />
      <StatsPeriodFilter years={years} value={period} onChange={setPeriod} />

      {!overviewLoading && overview && overview.events_total === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No events in this period yet. Run a tournament and these will start filling up.
        </Alert>
      )}

      <Grid container spacing={2} mb={2}>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label="Unique players"
            value={overview?.unique_players ?? "—"}
            sub={
              overview
                ? `${overview.linked_players} with accounts, ${nameMatched} matched by name`
                : undefined
            }
            loading={overviewLoading}
            color="info.main"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label="Events run"
            value={overview?.events_total ?? "—"}
            sub={overview ? `${overview.events_completed} completed` : undefined}
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label="Average field"
            value={overview?.avg_field_size ?? "—"}
            sub={overview ? `${overview.total_entries} entries` : undefined}
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label="Matches played"
            value={overview?.total_matches ?? "—"}
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label="Biggest event"
            value={overview?.largest_event_size ?? "—"}
            sub={overview?.largest_event_name ?? undefined}
            loading={overviewLoading}
            color="warning.main"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label="Drop-outs"
            value={overview?.dropped_entries ?? "—"}
            sub={
              overview && overview.total_entries > 0
                ? `${pct(overview.dropped_entries, overview.total_entries)} of entries`
                : undefined
            }
            loading={overviewLoading}
            color={overview && overview.dropped_entries > 0 ? "error.main" : undefined}
          />
        </Grid>
      </Grid>

      {showNewReturning && (
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <StatCard
              label="New players"
              value={overview?.new_players ?? "—"}
              sub={
                overview && overview.unique_players > 0
                  ? `${pct(overview.new_players, overview.unique_players)} of the room`
                  : undefined
              }
              loading={overviewLoading}
              color="success.main"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard
              label="Returning players"
              value={overview?.returning_players ?? "—"}
              sub={`Played before ${periodLabel(period)}`}
              loading={overviewLoading}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard
              label="Late entries"
              value={overview?.late_entries ?? "—"}
              loading={overviewLoading}
            />
          </Grid>
        </Grid>
      )}

      <StatsSection
        id="attendance"
        title="Attendance over time"
        defaultOpen
        summary={
          overview ? `${overview.unique_players} players · ${overview.events_total} events` : undefined
        }
        hint="How many different people showed up in each period, and how many of them were there for the first time."
      >
        <StatsTimeline
          points={points}
          loading={timelineLoading}
          emptyMessage="No events in this period yet."
          bucket={bucket}
          onBucketChange={setBucket}
        />
        {!timelineLoading && timeline.length > 0 && (
          <Box display="flex" flexWrap="wrap" gap={0.75} mt={1.5}>
            {timeline
              .filter((r) => r.new_players > 0)
              .slice(-6)
              .map((r) => (
                <Chip
                  key={r.period_start}
                  size="small"
                  variant="outlined"
                  color="success"
                  label={`${r.period_label}: ${r.new_players} new`}
                />
              ))}
          </Box>
        )}
      </StatsSection>

      <StatsSection
        id="league"
        title="League table"
        defaultOpen
        hint="A running table across several events. Match points come from the standings each event already showed; placement points reward finishing high. Events still in progress contribute match points only."
      >
        <LeagueTableSection workspaceId={workspaceId} gameId={gameId} />
      </StatsSection>

      {hasDecks && (
        <StatsSection
          id="meta"
          title="Meta share"
          hint="What people brought, by share of entries. A deck played three times by one person and one played once each by three people take up the same room, so 'pilots' is shown alongside."
        >
          <MetaShareSection
            workspaceId={workspaceId}
            gameId={gameId}
            nameMap={nameMap}
            onScopeChange={setDeckScope}
          />
        </StatsSection>
      )}

      {hasDecks && (
        <StatsSection
          id="diversity"
          title="Deck diversity"
          hint="Whether the meta is spreading out or concentrating. Counts how many decks the field effectively plays like, which — unlike a plain count of decks — does not simply rise and fall with turnout."
        >
          <DeckDiversitySection
            workspaceId={workspaceId}
            gameId={gameId}
            nameMap={nameMap}
            periodArgsValue={periodArgsValue}
          />
        </StatsSection>
      )}

      <StatsSection
        id="regulars"
        title="Regulars"
        summary={attendance.length > 0 ? `${attendance.length} players` : undefined}
        hint="Sorted by events attended. Players without an account are matched on name, so a typo can split one person into two rows — click anyone to review the entries behind them and correct it."
      >
        <Box mb={1.5}>
          <TextField
            size="small"
            placeholder="Search players"
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 220 }}
          />
        </Box>
        <MergeSuggestions
          workspaceId={workspaceId}
          canEdit={canEditIdentities}
          refreshKey={identityVersion}
          onChanged={() => setIdentityVersion((v) => v + 1)}
        />
        <StatsTable
          rows={visibleAttendance}
          columns={attendanceColumns}
          getRowKey={(r) => r.identity_key}
          onRowClick={(r) =>
            setOpenIdentity({
              identity_key: r.identity_key,
              display_name: r.display_name,
              events_played: r.events_played,
            })
          }
          initialSort={{ key: "events", dir: "desc" }}
          loading={attendanceLoading}
          csvFilename={`matchamp-regulars-${new Date().toISOString().slice(0, 10)}`}
          emptyMessage={
            attendance.length === 0
              ? "No players in this period yet."
              : "No players match that search."
          }
          maxRows={10}
        />
      </StatsSection>

      <StatsSection
        id="health"
        title="Event health"
        hint="How the events themselves ran: how long rounds took, which round people dropped in, and who entered the results."
      >
        <EventHealthSection
          workspaceId={workspaceId}
          gameId={gameId}
          periodArgsValue={periodArgsValue}
        />
      </StatsSection>

      <PlayerIdentityDialog
        workspaceId={workspaceId}
        identity={openIdentity}
        allIdentities={attendance.map((r) => ({
          identity_key: r.identity_key,
          display_name: r.display_name,
          events_played: r.events_played,
        }))}
        canEdit={canEditIdentities}
        onClose={() => setOpenIdentity(null)}
        onChanged={() => setIdentityVersion((v) => v + 1)}
      />

      <Box pb={4} />
    </Box>
    </StatsDrillProvider>
  );
};

export default OrganiserStats;
