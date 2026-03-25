import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Chip,
  CircularProgress,
} from "@mui/material";
import { EmojiEventsOutlined as TrophyIcon } from "@mui/icons-material";
import { getAllEntries } from "../utils/playerStorage";
import { supabase } from "../supabaseClient";

interface TournamentSummary {
  tournament_id: string;
  tournament_name: string;
  workspace_name: string;
  status: string;
}

export default function DeviceTournaments() {
  const entries = useMemo(() => getAllEntries(), []);
  const [summaries, setSummaries] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(entries.length > 0);

  useEffect(() => {
    if (entries.length === 0) return;
    void (async () => {
      const { data } = await supabase.rpc("get_tournaments_summary", {
        p_tournament_ids: entries.map((e) => e.tournamentId),
      });
      setSummaries((data as TournamentSummary[]) ?? []);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preserve localStorage order; fall back to stored name if RPC hasn't loaded yet
  const rows = useMemo(() => {
    return entries.map((e) => {
      const live = summaries.find((s) => s.tournament_id === e.tournamentId);
      return {
        tournamentId: e.tournamentId,
        tournamentName: live?.tournament_name ?? e.tournamentName ?? "Tournament",
        workspaceName: live?.workspace_name ?? null,
        status: live?.status ?? null,
      };
    });
  }, [entries, summaries]);

  return (
    <Box maxWidth={560} mx="auto" mt={4}>
      <Stack direction="row" spacing={1} alignItems="center" mb={3}>
        <TrophyIcon sx={{ color: "text.secondary" }} />
        <Typography variant="h5" fontWeight={700}>
          My Tournaments
        </Typography>
      </Stack>

      {entries.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: "center", bgcolor: "action.hover" }}
        >
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No tournaments on this device yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use a join link from your organiser to register for a tournament.
          </Typography>
        </Paper>
      ) : loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((row) => {
            const isActive = row.status === "active";
            return (
              <Paper
                key={row.tournamentId}
                variant="outlined"
                component={Link}
                to={`/t/${row.tournamentId}/me`}
                sx={{
                  p: 2,
                  textDecoration: "none",
                  display: "block",
                  borderColor: isActive ? "primary.main" : undefined,
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
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
                  </Box>
                  {row.status && (
                    <Chip
                      label={row.status}
                      size="small"
                      color={isActive ? "success" : "default"}
                      variant={isActive ? "filled" : "outlined"}
                    />
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
