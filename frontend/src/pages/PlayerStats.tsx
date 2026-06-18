import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
import { getPokemonList, getSpriteUrl, getArtworkUrl, type PokemonEntry } from "../utils/pokemonCache";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OverviewStats {
  total_completed: number;
  total_match_wins: number;
  total_matches: number;
  match_wins_no_byes: number;
  matches_no_byes: number;
  top3_count: number;
  top8_count: number;
  eligible_top3: number;
  eligible_top8: number;
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
  if (decks.length === 0) return null;
  return (
    <Box display="flex" flexWrap="wrap" gap={0.75} mb={2}>
      <Chip
        label="All decks"
        variant={selected === null ? "filled" : "outlined"}
        color={selected === null ? "primary" : "default"}
        onClick={() => onChange(null)}
        size="small"
      />
      {decks.map((d, i) => {
        const isSelected = selected?.deck_pokemon1 === d.deck_pokemon1 && selected?.deck_pokemon2 === d.deck_pokemon2;
        const label = [d.deck_pokemon1, d.deck_pokemon2]
          .filter(Boolean)
          .map((id) => nameMap.get(id!) ?? `#${id}`)
          .join(" / ");
        return (
          <Chip
            key={i}
            avatar={
              d.deck_pokemon1 ? (
                <img src={getArtworkUrl(d.deck_pokemon1)} alt="" style={{ width: 20, height: 20, objectFit: "contain", borderRadius: "50%" }} />
              ) : undefined
            }
            label={label}
            variant={isSelected ? "filled" : "outlined"}
            color={isSelected ? "primary" : "default"}
            onClick={() => onChange(isSelected ? null : d)}
            size="small"
          />
        );
      })}
    </Box>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Divider sx={{ my: 3 }} />
      <Typography variant="overline" color="text.secondary" display="block" mb={1.5}>
        {children}
      </Typography>
    </>
  );
}

// ── Overview section ───────────────────────────────────────────────────────────

function OverviewSection({ data, loading }: { data: OverviewStats | null; loading: boolean }) {
  const winRate = data ? pct(data.total_match_wins, data.total_matches) : "—";
  const winRateNoByes = data ? pct(data.match_wins_no_byes, data.matches_no_byes) : "—";
  const top8Rate = data && data.eligible_top8 > 0 ? pct(data.top8_count, data.eligible_top8) : "—";
  const top3Rate = data && data.eligible_top3 > 0 ? pct(data.top3_count, data.eligible_top3) : "—";

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

  return (
    <>
      <Grid container spacing={2} mb={2}>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Win Rate" value={winRate} sub={data ? `${data.total_match_wins}W / ${data.total_matches - data.total_match_wins}L` : undefined} loading={loading} color="info.main" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Win Rate (no byes)" value={winRateNoByes} sub={data ? `${data.matches_no_byes} matches` : undefined} loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Tournaments" value={data?.total_completed ?? "—"} loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Top 8 Rate" value={top8Rate} sub={data ? `${data.top8_count} / ${data.eligible_top8}` : undefined} loading={loading} color="warning.main" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Top 3 Rate" value={top3Rate} sub={data ? `${data.top3_count} / ${data.eligible_top3}` : undefined} loading={loading} color="warning.main" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard label="Current Streak" value={streakLabel} loading={loading} color={streakColor} />
        </Grid>
      </Grid>
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

function DeckStatsSection({ data, loading, nameMap }: { data: DeckStat[]; loading: boolean; nameMap: Map<number, string> }) {
  const deckCount = data.length;
  const loyaltyLabel = deckCount === 0 ? null : deckCount === 1 ? "Specialist" : deckCount >= 5 ? "Meta Chaser" : "Flexible";

  return (
    <>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        {loyaltyLabel && <Chip label={loyaltyLabel} size="small" color={loyaltyLabel === "Specialist" ? "secondary" : loyaltyLabel === "Meta Chaser" ? "warning" : "default"} />}
        <Typography variant="body2" color="text.secondary">{deckCount} deck{deckCount !== 1 ? "s" : ""} registered across all tournaments</Typography>
      </Box>
      {loading ? (
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.disabled">No deck data yet. Set your deck before your next tournament.</Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Deck", "Tournaments", "Win Rate", "Matches", "Top 3", "Top 8"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <DeckLabel p1={d.deck_pokemon1} p2={d.deck_pokemon2} nameMap={nameMap} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Typography variant="body2">{d.tournaments_played}</Typography>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Typography variant="body2" fontWeight={600}>{pct(d.match_wins, d.total_matches)}</Typography>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Typography variant="body2">{d.match_wins}W / {d.total_matches - d.match_wins}L</Typography>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Typography variant="body2">{d.top3_count}</Typography>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Typography variant="body2">{d.top8_count}</Typography>
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

// ── First/Second section ───────────────────────────────────────────────────────

function FirstSecondSection({
  decks,
  nameMap,
}: {
  decks: DeckStat[];
  nameMap: Map<number, string>;
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
      })
      .then(({ data: rows }) => {
        if (rows && rows.length > 0) setData(rows[0] as FirstSecondStats);
        setLoading(false);
      });
  }, [selectedDeck]);

  const firstRate = data ? pct(data.went_first_wins, data.went_first_total) : "—";
  const secondRate = data ? pct(data.went_second_wins, data.went_second_total) : "—";
  const hasData = data && data.insights_count >= 5;

  return (
    <>
      <DeckFilter decks={decks} selected={selectedDeck} nameMap={nameMap} onChange={setSelectedDeck} />
      {!hasData && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Not enough data yet — submit post-game insights after your next match to track this.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Going First"
            value={firstRate}
            sub={data ? `${data.went_first_wins}W / ${data.went_first_total - data.went_first_wins}L` : undefined}
            loading={loading}
            color="primary.main"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Going Second"
            value={secondRate}
            sub={data ? `${data.went_second_wins}W / ${data.went_second_total - data.went_second_wins}L` : undefined}
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
                  if (f > s) return <Typography variant="body2" color="success.main">You win <strong>{diff.toFixed(0)}% more</strong> when going first — tempo advantage is real for you.</Typography>;
                  return <Typography variant="body2" color="secondary.main">You actually win <strong>{diff.toFixed(0)}% more</strong> going second — you may benefit from reactive strategies.</Typography>;
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
}: {
  decks: DeckStat[];
  nameMap: Map<number, string>;
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
      })
      .then(({ data: rows }) => {
        setData((rows ?? []) as MatchupRow[]);
        setLoading(false);
      });
  }, [selectedDeck]);

  return (
    <>
      <DeckFilter decks={decks} selected={selectedDeck} nameMap={nameMap} onChange={setSelectedDeck} />
      {loading ? (
        <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1 }} />
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No matchup data yet. Opponent deck info comes from their tournament entry or post-game insights.
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Opponent deck", "Played", "W", "L", "D", "Win Rate"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Opponent deck" ? "left" : "center", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const rate = row.matches_played > 0 ? (row.wins / row.matches_played) * 100 : 0;
                const rateColor = rate >= 60 ? "#4caf50" : rate <= 40 ? "#f44336" : undefined;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <DeckLabel p1={row.opp_pokemon1} p2={row.opp_pokemon2} nameMap={nameMap} />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}><Typography variant="body2">{row.matches_played}</Typography></td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}><Typography variant="body2" color="success.main">{row.wins}</Typography></td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}><Typography variant="body2" color="error.main">{row.losses}</Typography></td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}><Typography variant="body2" color="text.secondary">{row.draws}</Typography></td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <Typography variant="body2" fontWeight={700} color={rateColor}>
                        {pct(row.wins, row.matches_played)}
                      </Typography>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      )}
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
              ? `Clutch factor: +${clutchRating}% — you improve late in events`
              : Number(clutchRating) <= -5
              ? `Tilt factor: ${clutchRating}% — win rate drops late in events`
              : "Consistent performer — your win rate is stable across rounds"}
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

function TrendSection({ data, loading }: { data: TrendRow[]; loading: boolean }) {
  const glowUp = useMemo(() => {
    if (data.length < 4) return false;
    const recent = data.slice(-2);
    const older = data.slice(0, 2);
    const recentRate = recent.reduce((s, r) => s + r.wins, 0) / Math.max(recent.reduce((s, r) => s + r.total, 0), 1);
    const olderRate = older.reduce((s, r) => s + r.wins, 0) / Math.max(older.reduce((s, r) => s + r.total, 0), 1);
    return recentRate - olderRate > 0.05;
  }, [data]);

  return (
    <>
      {glowUp && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <EmojiEventsIcon fontSize="small" color="warning" />
          <Typography variant="body2" color="warning.main">Glow-up detected — your win rate is trending upward.</Typography>
        </Box>
      )}
      {loading ? (
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.disabled">No trend data yet — play in more tournaments to see improvement over time.</Typography>
      ) : (
        <Box display="flex" gap={1.5} flexWrap="wrap">
          {data.map((r, i) => {
            const rate = r.total > 0 ? (r.wins / r.total) * 100 : null;
            const isLatest = i === data.length - 1;
            return (
              <Card key={r.period_start} variant="outlined" sx={{ minWidth: 100, borderColor: isLatest ? "primary.main" : undefined }}>
                <CardContent sx={{ pb: "12px !important", pt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" display="block">{r.period_label}</Typography>
                  <Typography variant="h5" fontWeight={700} color={rate != null && rate >= 55 ? "success.main" : rate != null && rate <= 40 ? "error.main" : "text.primary"}>
                    {rate != null ? `${rate.toFixed(0)}%` : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">{r.total} matches</Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PlayerStats: React.FC = () => {
  const { user } = useAuth();

  const [nameMap, setNameMap] = useState<Map<number, string>>(new Map());
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

  useEffect(() => {
    if (!user) return;

    void supabase.rpc("get_player_overview_stats").then(({ data }) => {
      if (data && data.length > 0) setOverview(data[0] as OverviewStats);
      setOverviewLoading(false);
    });

    void supabase.rpc("get_player_deck_stats").then(({ data }) => {
      setDecks((data ?? []) as DeckStat[]);
      setDecksLoading(false);
    });

    void supabase.rpc("get_player_round_performance").then(({ data }) => {
      setRounds((data ?? []) as RoundRow[]);
      setRoundsLoading(false);
    });

    void supabase.rpc("get_player_trend").then(({ data }) => {
      setTrend((data ?? []) as TrendRow[]);
      setTrendLoading(false);
    });
  }, [user]);

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
      </Box>

      {/* Overview */}
      <OverviewSection data={overview} loading={overviewLoading} />

      {/* Deck stats */}
      <SectionHeader>Deck History</SectionHeader>
      <DeckStatsSection data={decks} loading={decksLoading} nameMap={nameMap} />

      {/* First / Second */}
      <SectionHeader>Going First vs Second</SectionHeader>
      <FirstSecondSection decks={decks} nameMap={nameMap} />

      {/* Matchup matrix */}
      <SectionHeader>Matchup Matrix</SectionHeader>
      <MatchupMatrixSection decks={decks} nameMap={nameMap} />

      {/* Round performance */}
      <SectionHeader>Round-by-Round Performance</SectionHeader>
      <RoundPerformanceSection data={rounds} loading={roundsLoading} />

      {/* Trend */}
      <SectionHeader>Win Rate Trend</SectionHeader>
      <TrendSection data={trend} loading={trendLoading} />

      <Box pb={4} />
    </Box>
  );
};

export default PlayerStats;
