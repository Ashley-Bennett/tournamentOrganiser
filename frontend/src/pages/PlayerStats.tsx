import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Typography,
  Alert,
  Button,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import { getPokemonList, getSpriteUrl } from "../utils/pokemonCache";
import StatsPeriodFilter from "../components/StatsPeriodFilter";
import StatsGameFilter from "../components/StatsGameFilter";
import StatsTimeline, { type TimelineBucket, type TimelinePoint } from "../components/StatsTimeline";
import StatsTable, { type StatsColumn } from "../components/StatsTable";
import StatsSection from "../components/StatsSection";
import PlayerPaceSection from "../components/PlayerPaceSection";
import StatsDeckFilter from "../components/StatsDeckFilter";
import { deckKey, deckName } from "../utils/deck";
import { getGame } from "../games/registry";
import { ALL_TIME, periodArgs, periodLabel, type StatsPeriod } from "../utils/statsPeriod";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OverviewStats {
  total_completed: number;
  total_match_wins: number;
  total_matches: number;
  match_wins_no_byes: number;
  matches_no_byes: number;
  first_count: number;
  top3_count: number;
  top8_count: number;
  ranked_events: number;
  best_finish: number | null;
  current_streak: number;
  longest_win_streak: number;
  longest_loss_streak: number;
  nemesis_name: string | null;
  nemesis_wins: number | null;
  nemesis_losses: number | null;
  victim_name: string | null;
  victim_wins: number | null;
  victim_losses: number | null;
}

interface DeckStat {
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
  tournaments_played: number;
  match_wins: number;
  total_matches: number;
  top3_count: number;
  top8_count: number;
  first_used: string;
  last_used: string;
}

interface MatchupRow {
  opp_pokemon1: number | null;
  opp_pokemon2: number | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
}

interface RoundRow {
  round_number: number;
  wins: number;
  total: number;
}

interface TrendRow {
  period_label: string;
  period_start: string;
  wins: number;
  total: number;
}

interface YearRow {
  year: number;
  tournaments: number;
  matches: number;
}

interface FirstSecondStats {
  went_first_wins: number;
  went_first_total: number;
  went_second_wins: number;
  went_second_total: number;
  insights_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(wins: number, total: number): string {
  if (total === 0) return "—";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

function DeckLabel({ p1, p2, nameMap }: { p1: number | null; p2: number | null; nameMap: Map<number, string> }) {
  if (!p1 && !p2) return <Typography variant="body2" color="text.secondary">Unknown</Typography>;
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      {p1 != null && <img src={getSpriteUrl(p1)} alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />}
      {p2 != null && <img src={getSpriteUrl(p2)} alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />}
      <Typography variant="body2">
        {[p1, p2].filter(Boolean).map((id) => nameMap.get(id!) ?? `#${id}`).join(" / ")}
      </Typography>
    </Box>
  );
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
            {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Deck selector chips ────────────────────────────────────────────────────────

/**
 * Deck filter — a thin adapter onto the shared DeckPicker so the sections here
 * keep passing DeckStat objects around rather than ids.
 */
function DeckFilter({
  decks,
  selected,
  nameMap,
  onChange,
}: {
  decks: DeckStat[];
  selected: DeckStat | null;
  nameMap: Map<number, string>;
  onChange: (d: DeckStat | null) => void;
}) {
  const withSummary = useMemo(
    () =>
      decks.map((d) => ({
        ...d,
        secondary: `${d.tournaments_played} tournament${d.tournaments_played === 1 ? "" : "s"} · ${pct(d.match_wins, d.total_matches)}`,
      })),
    [decks],
  );

  return (
    <StatsDeckFilter
      decks={withSummary}
      selected={
        selected
          ? (withSummary.find(
              (d) =>
                d.deck_pokemon1 === selected.deck_pokemon1 &&
                d.deck_pokemon2 === selected.deck_pokemon2,
            ) ?? null)
          : null
      }
      nameMap={nameMap}
      onChange={(d) => onChange(d ? decks.find((x) => deckKey(x) === deckKey(d)) ?? null : null)}
    />
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

// ── Overview section ───────────────────────────────────────────────────────────

/**
 * Placement tiers, hardest first.
 *
 * All three are out of the same `ranked_events`, and they nest — a 1st counts
 * as a top 3 and a top 8 — so the three cards can be read against each other
 * and the counts can never go backwards.
 */
const TIERS = [
  { key: "first", label: "1st Place Rate", count: (d: OverviewStats) => d.first_count, unlock: "Win an event" },
  { key: "top3",  label: "Top 3 Rate",     count: (d: OverviewStats) => d.top3_count,  unlock: "Finish top 3" },
  { key: "top8",  label: "Top 8 Rate",     count: (d: OverviewStats) => d.top8_count,  unlock: "Finish top 8 in a field of 8+" },
] as const;

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

function OverviewSection({ data, loading }: { data: OverviewStats | null; loading: boolean }) {
  const winRate = data ? pct(data.total_match_wins, data.total_matches) : "—";
  const winRateNoByes = data ? pct(data.match_wins_no_byes, data.matches_no_byes) : "—";

  const streakLabel = !data
    ? "—"
    : data.current_streak > 0
    ? `${data.current_streak}W`
    : data.current_streak < 0
    ? `${Math.abs(data.current_streak)}L`
    : "—";

  const streakColor = !data
    ? undefined
    : data.current_streak > 0
    ? "success.main"
    : data.current_streak < 0
    ? "error.main"
    : undefined;

  // A tier only appears once it has actually been reached. Showing a 0% "1st
  // Place Rate" to someone who has never won reads as a rebuke rather than a
  // stat, and placing 1st reveals all three at once because a 1st is also a
  // top 3 and a top 8.
  const earned = data ? TIERS.filter((t) => t.count(data) > 0) : [];
  const nextLocked = data ? [...TIERS].reverse().find((t) => t.count(data) === 0) : undefined;

  // Shown only while there is still a better finish to chase — see the slot
  // comment below.
  const showBestFinish = !data || data.first_count === 0;

  return (
    <>
      <Grid container spacing={2} mb={2}>
        <Grid item xs={6} sm={4} md={2}>
          {/* "of N" rather than "/ NL": the remainder includes draws, not just losses */}
          <StatCard label="Win Rate" value={winRate} sub={data ? `${data.total_match_wins}W of ${data.total_matches}` : undefined} loading={loading} color="info.main" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Win Rate (no byes)" value={winRateNoByes} sub={data ? `${data.matches_no_byes} matches` : undefined} loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Tournaments" value={data?.total_completed ?? "—"} loading={loading} />
        </Grid>
        {/*
          Best Finish and the 1st Place Rate share a slot. Until you win an
          event, your best finish is the thing that moves and the win rate is a
          flat 0%; the moment you win, best finish is pinned at 1st forever and
          stops saying anything, while the rate carries on being useful.
        */}
        {showBestFinish && (
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              label="Best Finish"
              value={data?.best_finish != null ? `${data.best_finish}${ordinal(data.best_finish)}` : "—"}
              sub={data?.best_finish != null ? "Across all events" : "No finishes yet"}
              loading={loading}
            />
          </Grid>
        )}
        {earned.map((t) => (
          <Grid item xs={6} sm={4} md={2} key={t.key}>
            <StatCard
              label={t.label}
              value={data ? pct(t.count(data), data.ranked_events) : "—"}
              sub={data ? `${t.count(data)} of ${data.ranked_events} event${data.ranked_events === 1 ? "" : "s"}` : undefined}
              loading={loading}
              color="warning.main"
            />
          </Grid>
        ))}
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Current Streak" value={streakLabel} loading={loading} color={streakColor} />
        </Grid>
      </Grid>

      {!loading && nextLocked && (
        <Typography variant="caption" color="text.disabled" display="block" mb={2}>
          {nextLocked.unlock} to unlock your {nextLocked.label.replace(" Rate", "")} rate.
        </Typography>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Best Win Streak" value={data ? `${data.longest_win_streak}W` : "—"} loading={loading} color="success.main" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Worst Loss Streak" value={data ? `${data.longest_loss_streak}L` : "—"} loading={loading} color="error.main" />
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Nemesis</Typography>
              {loading ? <Skeleton variant="text" width={80} height={40} /> : data?.nemesis_name ? (
                <>
                  <Typography variant="h6" fontWeight={700} color="error.main">{data.nemesis_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{data.nemesis_wins}W – {data.nemesis_losses}L</Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.disabled">Not enough data</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Favourite opponent</Typography>
              {loading ? <Skeleton variant="text" width={80} height={40} /> : data?.victim_name ? (
                <>
                  <Typography variant="h6" fontWeight={700} color="success.main">{data.victim_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{data.victim_wins}W – {data.victim_losses}L</Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.disabled">Not enough data</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}

// ── Deck stats section ─────────────────────────────────────────────────────────

function DeckStatsSection({ data, loading, nameMap, period }: { data: DeckStat[]; loading: boolean; nameMap: Map<number, string>; period: StatsPeriod }) {
  const deckCount = data.length;
  const loyaltyLabel = deckCount === 0 ? null : deckCount === 1 ? "Specialist" : deckCount >= 5 ? "Meta Chaser" : "Flexible";

  const columns: StatsColumn<DeckStat>[] = useMemo(
    () => [
      {
        key: "deck",
        label: "Deck",
        sortValue: (d) => deckName(d, nameMap).toLowerCase(),
        render: (d) => <DeckLabel p1={d.deck_pokemon1} p2={d.deck_pokemon2} nameMap={nameMap} />,
      },
      {
        key: "tournaments",
        label: "Tournaments",
        sortValue: (d) => d.tournaments_played,
        render: (d) => <Typography variant="body2">{d.tournaments_played}</Typography>,
      },
      {
        key: "winrate",
        label: "Win Rate",
        sortValue: (d) => (d.total_matches > 0 ? d.match_wins / d.total_matches : null),
        csvValue: (d) =>
          d.total_matches > 0 ? Number(((d.match_wins / d.total_matches) * 100).toFixed(1)) : null,
        render: (d) => (
          <Typography variant="body2" fontWeight={600}>{pct(d.match_wins, d.total_matches)}</Typography>
        ),
      },
      {
        key: "matches",
        label: "Matches",
        sortValue: (d) => d.total_matches,
        render: (d) => <Typography variant="body2">{d.match_wins}W of {d.total_matches}</Typography>,
      },
      {
        key: "top3",
        label: "Top 3",
        sortValue: (d) => d.top3_count,
        render: (d) => <Typography variant="body2">{d.top3_count}</Typography>,
      },
      {
        key: "top8",
        label: "Top 8",
        sortValue: (d) => d.top8_count,
        render: (d) => <Typography variant="body2">{d.top8_count}</Typography>,
      },
    ],
    [nameMap],
  );

  return (
    <>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        {loyaltyLabel && <Chip label={loyaltyLabel} size="small" color={loyaltyLabel === "Specialist" ? "secondary" : loyaltyLabel === "Meta Chaser" ? "warning" : "default"} />}
        <Typography variant="body2" color="text.secondary">
          {deckCount} deck{deckCount !== 1 ? "s" : ""} registered {period.year == null ? "across all tournaments" : `in ${periodLabel(period)}`}
        </Typography>
      </Box>
      <StatsTable
        rows={data}
        columns={columns}
        getRowKey={(d) => deckKey(d)}
        initialSort={{ key: "tournaments", dir: "desc" }}
        loading={loading}
        emptyMessage="No deck data yet. Set your deck before your next tournament."
        maxRows={10}
        csvFilename={`matchamp-my-decks-${new Date().toISOString().slice(0, 10)}`}
      />
    </>
  );
}

// ── First/Second section ───────────────────────────────────────────────────────

function FirstSecondSection({
  decks,
  nameMap,
  period,
  gameId,
  hasDecks,
}: {
  decks: DeckStat[];
  nameMap: Map<number, string>;
  period: StatsPeriod;
  gameId: string | null;
  hasDecks: boolean;
}) {
  const [selectedDeck, setSelectedDeck] = useState<DeckStat | null>(null);
  const [data, setData] = useState<FirstSecondStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void supabase
      .rpc("get_player_first_second_stats", {
        p_deck_pokemon1: selectedDeck?.deck_pokemon1 ?? null,
        p_deck_pokemon2: selectedDeck?.deck_pokemon2 ?? null,
        ...periodArgs(period),
        p_game_id: gameId,
      })
      .then(({ data: rows }) => {
        setData(rows && rows.length > 0 ? (rows[0] as FirstSecondStats) : null);
        setLoading(false);
      });
  }, [selectedDeck, period, gameId]);

  const firstRate = data ? pct(data.went_first_wins, data.went_first_total) : "—";
  const secondRate = data ? pct(data.went_second_wins, data.went_second_total) : "—";
  const hasData = data && data.insights_count >= 5;

  return (
    <>
      {hasDecks && (
        <DeckFilter decks={decks} selected={selectedDeck} nameMap={nameMap} onChange={setSelectedDeck} />
      )}
      {!hasData && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Not enough data yet. Fill in the post-game questions after your next match and this will start filling up.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Going First"
            value={firstRate}
            sub={data ? `${data.went_first_wins}W of ${data.went_first_total}` : undefined}
            loading={loading}
            color="primary.main"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Going Second"
            value={secondRate}
            sub={data ? `${data.went_second_wins}W of ${data.went_second_total}` : undefined}
            loading={loading}
          />
        </Grid>
        {hasData && data && data.went_first_total > 0 && data.went_second_total > 0 && (
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ pb: "16px !important" }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Tempo insight</Typography>
                {(() => {
                  const f = data.went_first_wins / data.went_first_total;
                  const s = data.went_second_wins / data.went_second_total;
                  const diff = Math.abs(f - s) * 100;
                  if (diff < 5) return <Typography variant="body2">Going first or second barely matters for your results.</Typography>;
                  if (f > s) return <Typography variant="body2" color="success.main">You win <strong>{diff.toFixed(0)}% more</strong> when going first. Getting the first turn clearly suits you.</Typography>;
                  return <Typography variant="body2" color="secondary.main">You actually win <strong>{diff.toFixed(0)}% more</strong> going second. Reactive decks look like a good fit for you.</Typography>;
                })()}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </>
  );
}

// ── Matchup matrix section ─────────────────────────────────────────────────────

function MatchupMatrixSection({
  decks,
  nameMap,
  period,
  gameId,
}: {
  decks: DeckStat[];
  nameMap: Map<number, string>;
  period: StatsPeriod;
  gameId: string | null;
}) {
  const [selectedDeck, setSelectedDeck] = useState<DeckStat | null>(null);
  const [data, setData] = useState<MatchupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void supabase
      .rpc("get_player_matchup_matrix", {
        p_deck_pokemon1: selectedDeck?.deck_pokemon1 ?? null,
        p_deck_pokemon2: selectedDeck?.deck_pokemon2 ?? null,
        ...periodArgs(period),
        p_game_id: gameId,
      })
      .then(({ data: rows }) => {
        setData((rows ?? []) as MatchupRow[]);
        setLoading(false);
      });
  }, [selectedDeck, period, gameId]);

  const matchupColumns: StatsColumn<MatchupRow>[] = useMemo(
    () => [
      {
        key: "deck",
        label: "Opponent deck",
        sortValue: (r) =>
          deckName({ deck_pokemon1: r.opp_pokemon1, deck_pokemon2: r.opp_pokemon2 }, nameMap).toLowerCase(),
        render: (r) => <DeckLabel p1={r.opp_pokemon1} p2={r.opp_pokemon2} nameMap={nameMap} />,
      },
      {
        key: "played",
        label: "Played",
        align: "center",
        sortValue: (r) => r.matches_played,
        render: (r) => <Typography variant="body2">{r.matches_played}</Typography>,
      },
      {
        key: "w",
        label: "W",
        align: "center",
        sortValue: (r) => r.wins,
        render: (r) => <Typography variant="body2" color="success.main">{r.wins}</Typography>,
      },
      {
        key: "l",
        label: "L",
        align: "center",
        sortValue: (r) => r.losses,
        render: (r) => <Typography variant="body2" color="error.main">{r.losses}</Typography>,
      },
      {
        key: "d",
        label: "D",
        align: "center",
        sortValue: (r) => r.draws,
        render: (r) => <Typography variant="body2" color="text.secondary">{r.draws}</Typography>,
      },
      {
        key: "winrate",
        label: "Win Rate",
        align: "center",
        sortValue: (r) => (r.matches_played > 0 ? r.wins / r.matches_played : null),
        csvValue: (r) =>
          r.matches_played > 0 ? Number(((r.wins / r.matches_played) * 100).toFixed(1)) : null,
        render: (r) => {
          const rate = r.matches_played > 0 ? (r.wins / r.matches_played) * 100 : 0;
          return (
            <Typography
              variant="body2"
              fontWeight={700}
              color={rate >= 60 ? "success.main" : rate <= 40 ? "error.main" : undefined}
            >
              {pct(r.wins, r.matches_played)}
            </Typography>
          );
        },
      },
    ],
    [nameMap],
  );

  return (
    <>
      <DeckFilter decks={decks} selected={selectedDeck} nameMap={nameMap} onChange={setSelectedDeck} />
      <StatsTable
        rows={data}
        columns={matchupColumns}
        getRowKey={(r) => `${r.opp_pokemon1 ?? "x"}-${r.opp_pokemon2 ?? "x"}`}
        initialSort={{ key: "played", dir: "desc" }}
        loading={loading}
        emptyMessage="No matchup data yet. Opponent deck info comes from their tournament entry or post-game insights."
        maxRows={10}
        csvFilename={`matchamp-my-matchups-${new Date().toISOString().slice(0, 10)}`}
      />
    </>
  );
}

// ── Round performance section ──────────────────────────────────────────────────

function RoundPerformanceSection({ data, loading }: { data: RoundRow[]; loading: boolean }) {
  const clutchRating = useMemo(() => {
    if (data.length < 4) return null;
    const early = data.filter((r) => r.round_number <= 3);
    const late = data.filter((r) => r.round_number >= 5);
    if (!early.length || !late.length) return null;
    const earlyPct = early.reduce((s, r) => s + r.wins, 0) / early.reduce((s, r) => s + r.total, 0);
    const latePct = late.reduce((s, r) => s + r.wins, 0) / late.reduce((s, r) => s + r.total, 0);
    return ((latePct - earlyPct) * 100).toFixed(1);
  }, [data]);

  const maxTotal = useMemo(() => Math.max(...data.map((r) => r.total), 1), [data]);

  return (
    <>
      {clutchRating !== null && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <WhatshotIcon fontSize="small" color={Number(clutchRating) >= 0 ? "success" : "error"} />
          <Typography variant="body2">
            {Number(clutchRating) >= 5
              ? `Clutch factor: +${clutchRating}%. You get stronger late in events`
              : Number(clutchRating) <= -5
              ? `Tilt factor: ${clutchRating}%. Your win rate drops late in events`
              : "Steady. Your win rate holds up across rounds"}
          </Typography>
        </Box>
      )}
      {loading ? (
        <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 1 }} />
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.disabled">No round data yet.</Typography>
      ) : (
        <Box display="flex" gap={1.5} alignItems="flex-end" flexWrap="wrap">
          {data.map((r) => {
            const rate = r.total > 0 ? (r.wins / r.total) * 100 : 0;
            const barHeight = Math.max((r.total / maxTotal) * 80, 8);
            const barColor = rate >= 60 ? "#4caf50" : rate <= 35 ? "#f44336" : "#2196f3";
            return (
              <Box key={r.round_number} display="flex" flexDirection="column" alignItems="center" gap={0.5} minWidth={48}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {pct(r.wins, r.total)}
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: barHeight,
                    bgcolor: barColor,
                    borderRadius: "4px 4px 0 0",
                    opacity: 0.85,
                  }}
                />
                <Typography variant="caption" color="text.secondary">R{r.round_number}</Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6rem" }}>{r.total}g</Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );
}

// ── Trend section ──────────────────────────────────────────────────────────────

function TrendSection({
  data,
  loading,
  bucket,
  onBucketChange,
}: {
  data: TrendRow[];
  loading: boolean;
  bucket: TimelineBucket;
  onBucketChange: (b: TimelineBucket) => void;
}) {
  const glowUp = useMemo(() => {
    if (data.length < 4) return false;
    const recent = data.slice(-2);
    const older = data.slice(0, 2);
    const recentRate = recent.reduce((s, r) => s + r.wins, 0) / Math.max(recent.reduce((s, r) => s + r.total, 0), 1);
    const olderRate = older.reduce((s, r) => s + r.wins, 0) / Math.max(older.reduce((s, r) => s + r.total, 0), 1);
    return recentRate - olderRate > 0.05;
  }, [data]);

  // The bar height is the win rate, so the shared timeline draws the same
  // measure the cards used to. Tone is a real threshold call here — unlike a
  // headcount, a higher win rate genuinely is better.
  const points: TimelinePoint[] = useMemo(
    () =>
      data.map((r) => {
        const rate = r.total > 0 ? (r.wins / r.total) * 100 : null;
        return {
          key: r.period_start,
          label: r.period_label,
          value: rate,
          display: rate != null ? `${rate.toFixed(0)}%` : "—",
          sub: `${r.total} match${r.total === 1 ? "" : "es"}`,
          tone: rate == null ? undefined : rate >= 55 ? "good" : rate <= 40 ? "bad" : "neutral",
        };
      }),
    [data],
  );

  return (
    <>
      {glowUp && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <EmojiEventsIcon fontSize="small" color="warning" />
          <Typography variant="body2" color="warning.main">Your win rate is on the way up.</Typography>
        </Box>
      )}
      <StatsTimeline
        points={points}
        loading={loading}
        emptyMessage="No trend data yet. Play a few more tournaments and this will show how you're getting on."
        bucket={bucket}
        onBucketChange={onBucketChange}
      />
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PlayerStats: React.FC = () => {
  const { user } = useAuth();

  const [nameMap, setNameMap] = useState<Map<number, string>>(new Map());
  const [years, setYears] = useState<number[]>([]);
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>(ALL_TIME);
  const [trendBucket, setTrendBucket] = useState<TimelineBucket>("quarter");

  // Depended on as primitives rather than as the `period` object: an
  // equal-but-new object counts as a changed dependency, which would refetch
  // the page off a click that selected what was already selected.
  const periodYear = period.year;
  const periodArgsValue = useMemo(() => periodArgs({ year: periodYear }), [periodYear]);
  const { p_from, p_to } = periodArgsValue;
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [decks, setDecks] = useState<DeckStat[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(true);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    void getPokemonList().then((list) => {
      const m = new Map<number, string>();
      list.forEach((p) => m.set(p.id, p.displayName));
      setNameMap(m);
    });
  }, []);

  // Which games the player has entries in. Results are never combined across
  // games, so one is chosen up front — the busiest, which the RPC returns
  // first, meaning a single-game player lands exactly where they always did.
  useEffect(() => {
    if (!user) return;
    void supabase.rpc("get_player_stats_games").then(({ data }) => {
      const ids = ((data ?? []) as { game_id: string }[]).map((r) => r.game_id);
      setGameIds(ids);
      setGameId((current) => current ?? ids[0] ?? null);
    });
  }, [user]);

  // Years the player has results in for the chosen game.
  useEffect(() => {
    if (!user || !gameId) return;
    void supabase
      .rpc("get_player_stats_years", { p_game_id: gameId })
      .then(({ data }) => {
        setYears(((data ?? []) as YearRow[]).map((r) => r.year));
      });
  }, [user, gameId]);

  // Changing game invalidates the selected year — the years on offer differ.
  useEffect(() => {
    setPeriod(ALL_TIME);
  }, [gameId]);

  useEffect(() => {
    if (!user || !gameId) return;
    const args = { p_from, p_to, p_game_id: gameId };

    setOverviewLoading(true);
    setDecksLoading(true);
    setRoundsLoading(true);
    setTrendLoading(true);

    void supabase.rpc("get_player_overview_stats", args).then(({ data }) => {
      setOverview(data && data.length > 0 ? (data[0] as OverviewStats) : null);
      setOverviewLoading(false);
    });

    void supabase.rpc("get_player_deck_stats", args).then(({ data }) => {
      setDecks((data ?? []) as DeckStat[]);
      setDecksLoading(false);
    });

    void supabase.rpc("get_player_round_performance", args).then(({ data }) => {
      setRounds((data ?? []) as RoundRow[]);
      setRoundsLoading(false);
    });

    void supabase.rpc("get_player_trend", { ...args, p_bucket: trendBucket }).then(({ data }) => {
      setTrend((data ?? []) as TrendRow[]);
      setTrendLoading(false);
    });
  }, [user, p_from, p_to, gameId, trendBucket]);

  const hasDecks = getGame(gameId).deck !== "none";

  if (!user) {
    return (
      <Box textAlign="center" py={8}>
        <Typography variant="h6" color="text.secondary">Sign in to view your stats.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <Button component={Link} to="/dashboard" startIcon={<ArrowBackIcon />} size="small" color="inherit" sx={{ mr: 1 }}>
          Dashboard
        </Button>
        <ShowChartIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Your Stats</Typography>
        <Typography variant="body2" color="text.secondary">{periodLabel(period)}</Typography>
      </Box>

      {/* Game picker — hides itself for a player with only one game */}
      <StatsGameFilter gameIds={gameIds} value={gameId} onChange={setGameId} />

      {/* Season / quarter picker */}
      <StatsPeriodFilter years={years} value={period} onChange={setPeriod} />

      {/* Overview */}
      <OverviewSection data={overview} loading={overviewLoading} />

      {/*
        Deck history and the matchup matrix are deck-against-deck by nature, so
        a game without decks does not show them at all — an empty panel would
        read as missing data rather than as something that does not apply here.
        Going first still means something without decks, so it stays.
      */}
      {hasDecks && (
        <StatsSection
          id="player-decks"
          title="Deck History"
          defaultOpen
          summary={decks.length > 0 ? `${decks.length} deck${decks.length === 1 ? "" : "s"}` : undefined}
        >
          <DeckStatsSection data={decks} loading={decksLoading} nameMap={nameMap} period={period} />
        </StatsSection>
      )}

      <StatsSection id="player-first-second" title="Going First vs Second">
        <FirstSecondSection
          decks={decks}
          nameMap={nameMap}
          period={period}
          gameId={gameId}
          hasDecks={hasDecks}
        />
      </StatsSection>

      {hasDecks && (
        <StatsSection id="player-matchups" title="Matchup Matrix">
          <MatchupMatrixSection decks={decks} nameMap={nameMap} period={period} gameId={gameId} />
        </StatsSection>
      )}

      <StatsSection id="player-pace" title="Game Pace">
        <PlayerPaceSection
          periodArgsValue={periodArgsValue}
          gameId={gameId}
          nameMap={nameMap}
        />
      </StatsSection>

      <StatsSection id="player-rounds" title="Round-by-Round Performance">
        <RoundPerformanceSection data={rounds} loading={roundsLoading} />
      </StatsSection>

      <StatsSection id="player-trend" title="Win Rate Trend" defaultOpen>
        <TrendSection
          data={trend}
          loading={trendLoading}
          bucket={trendBucket}
          onBucketChange={setTrendBucket}
        />
      </StatsSection>

      <Box pb={4} />
    </Box>
  );
};

export default PlayerStats;
