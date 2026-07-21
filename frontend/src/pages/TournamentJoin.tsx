import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { useAuth } from "../AuthContext";

// ── Component ─────────────────────────────────────────────────────────────────

export default function TournamentJoin() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [pageState, setPageState] = useState<
    "loading" | "open" | "closed" | "not_found"
  >("loading");
  const [tournamentName, setTournamentName] = useState("");
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameTaken = useMemo(
    () => registeredNames.some((n) => n.toLowerCase() === nameInput.trim().toLowerCase()),
    [registeredNames, nameInput],
  );

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
      const name = (row as { tournament_name: string; status: string; join_enabled: boolean; registered_names: string[] }).tournament_name;
      const status = (row as { tournament_name: string; status: string; join_enabled: boolean; registered_names: string[] }).status;
      const joinEnabled = (row as { tournament_name: string; status: string; join_enabled: boolean; registered_names: string[] }).join_enabled;
      const names = (row as { tournament_name: string; status: string; join_enabled: boolean; registered_names: string[] }).registered_names ?? [];

      setTournamentName(name);
      setRegisteredNames(names);

      // Expire cache if tournament is completed
      if (status === "completed") {
        clearEntry(tournamentId);
        setPageState("closed");
        return;
      }

      // Check for existing registration — verify it server-side first, since
      // the organiser may have removed this player after we cached the entry.
      const existing = getEntry(tournamentId);
      if (existing) {
        const { error: verifyError } = await supabase.rpc("get_player_tournament_view", {
          p_tournament_id: tournamentId,
          p_player_id: existing.playerId,
          p_device_token: existing.deviceToken,
        });
        if (verifyError?.message.includes("Invalid player credentials")) {
          // Stale registration (player deleted) — clear it and fall through to the join form
          clearEntry(tournamentId);
        } else {
          navigate(`/t/${tournamentId}/me`, { replace: true });
          return;
        }
      }

      if (!joinEnabled || status !== "draft") {
        setPageState("closed");
        return;
      }

      // Pre-fill name: prefer logged-in display name, fall back to device profile
      const deviceProfile = getProfile();
      const prefill = profile?.display_name || deviceProfile.name;
      if (prefill) setNameInput(prefill);

      setPageState("open");
    })();
  }, [tournamentId, navigate]);

  const handleSubmit = async () => {
    if (!tournamentId || !nameInput.trim() || nameTaken) return;
    setSubmitting(true);
    setError(null);

    const deviceProfile = getProfile();

    const { data, error: rpcError } = await supabase.rpc("self_join_tournament", {
      p_tournament_id: tournamentId,
      p_player_name: nameInput.trim(),
      p_device_id: deviceProfile.deviceId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const entry: TjEntry = {
      playerId: (row as { player_id: string; device_token: string; tournament_name: string }).player_id,
      deviceToken: (row as { player_id: string; device_token: string; tournament_name: string }).device_token,
      joinedAt: new Date().toISOString(),
      tournamentName: (row as { player_id: string; device_token: string; tournament_name: string }).tournament_name,
    };

    saveEntry(tournamentId, entry);
    saveProfile(nameInput.trim(), (deviceProfile as TjProfile).deviceId);

    navigate(`/t/${tournamentId}/me`, { replace: true });
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
              inputProps={{ maxLength: 50 }}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              disabled={submitting}
              error={nameTaken}
              helperText={nameTaken ? "This name is already taken — please use a different name." : " "}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={() => void handleSubmit()}
              disabled={submitting || !nameInput.trim() || nameTaken}
            >
              {submitting ? <CircularProgress size={22} /> : "Join Tournament"}
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
