import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
  Alert,
  Paper,
} from "@mui/material";
import { supabase } from "../supabaseClient";
import {
  TjEntry,
  TjProfile,
  getProfile,
  saveProfile,
  getEntry,
  saveEntry,
  clearEntry,
} from "../utils/playerStorage";

// ── Component ─────────────────────────────────────────────────────────────────

export default function TournamentJoin() {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const [pageState, setPageState] = useState<
    "loading" | "open" | "already_joined" | "closed" | "not_found" | "success"
  >("loading");
  const [tournamentName, setTournamentName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tournamentId) { setPageState("not_found"); return; }

    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("get_tournament_for_join", {
        p_tournament_id: tournamentId,
      });

      if (rpcError || !data || (Array.isArray(data) && data.length === 0)) {
        setPageState("not_found");
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const name = (row as { tournament_name: string; status: string; join_enabled: boolean }).tournament_name;
      const status = (row as { tournament_name: string; status: string; join_enabled: boolean }).status;
      const joinEnabled = (row as { tournament_name: string; status: string; join_enabled: boolean }).join_enabled;

      setTournamentName(name);

      // Expire cache if tournament is completed
      if (status === "completed") {
        clearEntry(tournamentId);
        setPageState("closed");
        return;
      }

      // Check for existing registration
      const existing = getEntry(tournamentId);
      if (existing) {
        setPageState("already_joined");
        return;
      }

      if (!joinEnabled || status !== "draft") {
        setPageState("closed");
        return;
      }

      // Pre-fill name from device profile
      const profile = getProfile();
      if (profile.name) setNameInput(profile.name);

      setPageState("open");
    })();
  }, [tournamentId]);

  const handleSubmit = async () => {
    if (!tournamentId || !nameInput.trim()) return;
    setSubmitting(true);
    setError(null);

    const profile = getProfile();

    const { data, error: rpcError } = await supabase.rpc("self_join_tournament", {
      p_tournament_id: tournamentId,
      p_player_name: nameInput.trim(),
      p_device_id: profile.deviceId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const entry: TjEntry = {
      playerId: (row as { player_id: string; device_token: string }).player_id,
      deviceToken: (row as { player_id: string; device_token: string }).device_token,
      joinedAt: new Date().toISOString(),
    };

    saveEntry(tournamentId, entry);
    saveProfile(nameInput.trim(), (profile as TjProfile).deviceId);

    setPageState("success");
    setSubmitting(false);
  };

  if (pageState === "loading") {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      px={2}
    >
      <Paper sx={{ p: 4, maxWidth: 440, width: "100%" }}>
        {pageState === "not_found" && (
          <>
            <Typography variant="h6" gutterBottom>Tournament not found</Typography>
            <Typography variant="body2" color="text.secondary">
              This link may be invalid or the tournament has been removed.
            </Typography>
          </>
        )}

        {pageState === "closed" && (
          <>
            <Typography variant="h6" gutterBottom>{tournamentName || "Tournament"}</Typography>
            <Typography variant="body2" color="text.secondary">
              Registration is closed for this tournament.
            </Typography>
          </>
        )}

        {pageState === "already_joined" && (
          <>
            <Typography variant="h6" gutterBottom>{tournamentName}</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              You&apos;re already registered for this tournament.
            </Alert>
            {tournamentId && (
              <Button
                component={Link}
                to={`/t/${tournamentId}/me`}
                variant="contained"
                fullWidth
                size="large"
              >
                Go to your tournament page
              </Button>
            )}
          </>
        )}

        {pageState === "success" && (
          <>
            <Typography variant="h6" gutterBottom>{tournamentName}</Typography>
            <Alert severity="success" sx={{ mb: 2 }}>
              You&apos;re in! See you at the tournament.
            </Alert>
            {tournamentId && (
              <Button
                component={Link}
                to={`/t/${tournamentId}/me`}
                variant="contained"
                fullWidth
                size="large"
              >
                Go to your tournament page
              </Button>
            )}
          </>
        )}

        {pageState === "open" && (
          <>
            <Typography variant="h5" gutterBottom fontWeight={600}>
              {tournamentName}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Enter your name to join the tournament.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              label="Your name"
              fullWidth
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              disabled={submitting}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={() => void handleSubmit()}
              disabled={submitting || !nameInput.trim()}
            >
              {submitting ? <CircularProgress size={22} /> : "Join Tournament"}
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
