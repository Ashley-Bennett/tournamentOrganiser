import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/material";
import { EmojiEventsOutlined as TrophyIcon } from "@mui/icons-material";
import { getAllEntries } from "../utils/playerStorage";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}

interface TournamentSummary {
  tournament_id: string;
  tournament_name: string;
  workspace_name: string;
  status: string;
  player_position: number | null;
  total_players: number | null;
}

interface DbEntry {
  tournament_player_id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_status: string;
  workspace_name: string;
  player_name: string;
}

interface Row {
  tournamentId: string;
  tournamentName: string;
  workspaceName: string | null;
  status: string | null;
  playerPosition: number | null;
  totalPlayers: number | null;
  isLinked: boolean;
  // present for unlinked device entries
  playerId?: string;
  deviceToken?: string;
}

export default function DeviceTournaments() {
  const { user } = useAuth();
  const deviceEntries = useMemo(() => getAllEntries(), []);

  const [dbEntries, setDbEntries] = useState<DbEntry[]>([]);
  const [summaries, setSummaries] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({});
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all([
      user ? supabase.rpc("get_my_player_entries") : Promise.resolve({ data: [] }),
      deviceEntries.length > 0
        ? supabase.rpc("get_tournaments_summary", {
            p_tournament_ids: deviceEntries.map((e) => e.tournamentId),
            p_player_ids: deviceEntries.map((e) => e.playerId),
          })
        : Promise.resolve({ data: [] }),
    ]);
    setDbEntries((results[0].data as DbEntry[]) ?? []);
    setSummaries((results[1].data as TournamentSummary[]) ?? []);
    setLoading(false);
  }, [user, deviceEntries]);

  useEffect(() => {
    void load();
  }, [load]);

  const linkedIds = useMemo(() => new Set(dbEntries.map((e) => e.tournament_id)), [dbEntries]);

  const rows = useMemo((): Row[] => {
    // DB-linked entries
    const dbRows: Row[] = dbEntries.map((e) => ({
      tournamentId: e.tournament_id,
      tournamentName: e.tournament_name,
      workspaceName: e.workspace_name,
      status: e.tournament_status,
      playerPosition: null,
      totalPlayers: null,
      isLinked: true,
    }));

    // Device entries not yet linked (or already claimed in this session)
    const deviceRows: Row[] = deviceEntries.flatMap((e) => {
      if (linkedIds.has(e.tournamentId) || claimedIds.has(e.tournamentId)) return [];
      const summary = summaries.find((s) => s.tournament_id === e.tournamentId);
      if (!loading && !summary) return [];
      return [{
        tournamentId: e.tournamentId,
        tournamentName: summary?.tournament_name ?? e.tournamentName ?? "Tournament",
        workspaceName: summary?.workspace_name ?? null,
        status: summary?.status ?? null,
        playerPosition: summary?.player_position ?? null,
        totalPlayers: summary?.total_players ?? null,
        isLinked: false,
        playerId: e.playerId,
        deviceToken: e.deviceToken,
      }];
    });

    const all = [...dbRows, ...deviceRows];
    // Active first, then by insertion order
    return all.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return 0;
    });
  }, [dbEntries, deviceEntries, summaries, linkedIds, claimedIds, loading]);

  const unlinkedCount = rows.filter((r) => !r.isLinked).length;

  const handleClaim = async (row: Row) => {
    if (!row.playerId || !row.deviceToken) return;
    setClaimingId(row.tournamentId);
    setClaimErrors((prev) => ({ ...prev, [row.tournamentId]: "" }));
    const { error } = await supabase.rpc("self_claim_player_entry", {
      p_tournament_player_id: row.playerId,
      p_device_token: row.deviceToken,
    });
    setClaimingId(null);
    if (error && !error.message.includes("already linked")) {
      setClaimErrors((prev) => ({ ...prev, [row.tournamentId]: error.message }));
      return;
    }
    setClaimedIds((prev) => new Set([...prev, row.tournamentId]));
    void load();
  };

  const isEmpty = !loading && rows.length === 0;

  return (
    <Box maxWidth={560} mx="auto" mt={4}>
      <Stack direction="row" spacing={1} alignItems="center" mb={3}>
        <TrophyIcon sx={{ color: "text.secondary" }} />
        <Typography variant="h5" fontWeight={700}>
          My Tournaments
        </Typography>
      </Stack>

      {/* Nudge: anonymous user with device entries */}
      {!user && deviceEntries.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
              <Button component={Link} to="/register" size="small" color="inherit" variant="outlined">
                Sign up
              </Button>
              <Button component={Link} to="/login" size="small" color="inherit">
                Log in
              </Button>
            </Box>
          }
        >
          This history is saved on this device only — it may be cleared after 7 days.
          Sign up to keep it forever.
        </Alert>
      )}

      {/* Nudge: logged-in user with unlinked device entries */}
      {user && !loading && unlinkedCount > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {unlinkedCount} tournament{unlinkedCount !== 1 ? "s are" : " is"} saved on this device only.
          Link {unlinkedCount !== 1 ? "them" : "it"} to your account to keep your history safe.
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      ) : isEmpty ? (
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: "center", bgcolor: "action.hover" }}
        >
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No tournaments yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Scan a QR code or enter a join code to register for a tournament.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((row) => {
            const isActive = row.status === "active";
            const isCompleted = row.status === "completed";
            const hasPosition = isCompleted && row.playerPosition != null && row.totalPlayers != null;
            const claimError = claimErrors[row.tournamentId];

            return (
              <Paper
                key={row.tournamentId}
                variant="outlined"
                sx={{
                  p: 2,
                  display: "block",
                  borderColor: isActive ? "primary.main" : undefined,
                  transition: "border-color 0.15s, background-color 0.15s",
                  ...(!row.isLinked && user ? {} : {
                    textDecoration: "none",
                    "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                    cursor: "pointer",
                  }),
                }}
                component={row.isLinked || !user ? Link : "div"}
                to={row.isLinked || !user ? `/t/${row.tournamentId}/me` : undefined}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box flexGrow={1}>
                    <Typography variant="subtitle2" fontWeight={500}>
                      {row.tournamentName}
                    </Typography>
                    {row.workspaceName && (
                      <Typography variant="body2" color="text.secondary">
                        {row.workspaceName}
                      </Typography>
                    )}
                    {hasPosition && (
                      <Typography variant="body2" color="text.secondary">
                        Finished {row.playerPosition}{ordinal(row.playerPosition!)} of {row.totalPlayers}
                      </Typography>
                    )}
                    {claimError && (
                      <Typography variant="caption" color="error">{claimError}</Typography>
                    )}
                  </Box>

                  {row.status && (
                    <Chip
                      label={row.status}
                      size="small"
                      color={isActive ? "success" : "default"}
                      variant={isActive ? "filled" : "outlined"}
                    />
                  )}

                  {!row.isLinked && user && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={claimingId === row.tournamentId}
                      onClick={(e) => { e.stopPropagation(); void handleClaim(row); }}
                    >
                      {claimingId === row.tournamentId ? "Linking…" : "Link"}
                    </Button>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Box mt={3}>
        <Button component={Link} to="/join" size="small" color="inherit">
          + Join another tournament
        </Button>
      </Box>
    </Box>
  );
}
