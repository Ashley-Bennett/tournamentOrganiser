import { useState } from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Button,
  Stack,
  Paper,
  Chip,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  EmojiEvents as TrophyIcon,
  QrCodeScanner as JoinIcon,
  LinkOutlined as LinkIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { getAllEntries } from "../utils/playerStorage";
import { supabase } from "../supabaseClient";

interface LocalEntry {
  tournamentId: string;
  playerId: string;
  deviceToken: string;
  tournamentName?: string;
}

const Welcome = () => {
  const navigate = useNavigate();
  const { displayName, updateProfile } = useAuth();
  const { workspaces } = useWorkspace();

  const [step, setStep] = useState<"choose" | "claim">("choose");
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const handleOrganiserChoice = async () => {
    await updateProfile({ onboarding_intent: "organiser" });
    if (workspaces.length > 0) {
      navigate(`/w/${workspaces[0].slug}/tournaments`, { state: { openCreate: true } });
    } else {
      navigate("/workspaces/new");
    }
  };

  const handlePlayerChoice = async () => {
    await updateProfile({ onboarding_intent: "player" });
    const entries = getAllEntries();
    if (entries.length === 0) {
      navigate("/join");
      return;
    }
    setLocalEntries(entries);
    setStep("claim");
  };

  const handleClaimAll = async () => {
    setClaimLoading(true);
    setClaimError("");
    const newClaimed = new Set(claimedIds);
    for (const entry of localEntries) {
      if (newClaimed.has(entry.tournamentId)) continue;
      const { error } = await supabase.rpc("self_claim_player_entry", {
        p_tournament_player_id: entry.playerId,
        p_device_token: entry.deviceToken,
      });
      if (!error || error.message.includes("already linked")) {
        newClaimed.add(entry.tournamentId);
      } else {
        setClaimError("Some entries couldn't be linked. You can link them from My Tournaments.");
      }
    }
    setClaimedIds(newClaimed);
    setClaimLoading(false);
    navigate("/join");
  };

  if (step === "claim") {
    return (
      <Box maxWidth={520} mx="auto" mt={8}>
        <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
          <LinkIcon sx={{ fontSize: 28, color: "primary.main" }} />
          <Typography variant="h5" fontWeight={700}>
            We found your tournament history
          </Typography>
        </Stack>
        <Typography variant="body1" color="text.secondary" mb={3}>
          You've played in {localEntries.length} tournament{localEntries.length !== 1 ? "s" : ""} on this device.
          Link {localEntries.length !== 1 ? "them" : "it"} to your account so your history is never lost.
        </Typography>

        {claimError && (
          <Alert severity="warning" sx={{ mb: 2 }}>{claimError}</Alert>
        )}

        <Stack spacing={1.5} mb={4}>
          {localEntries.map((entry) => (
            <Paper
              key={entry.tournamentId}
              variant="outlined"
              sx={{
                p: 2,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                borderColor: claimedIds.has(entry.tournamentId) ? "success.main" : undefined,
              }}
            >
              <Box flexGrow={1}>
                <Typography variant="subtitle2" fontWeight={500}>
                  {entry.tournamentName ?? "Tournament"}
                </Typography>
              </Box>
              {claimedIds.has(entry.tournamentId) && (
                <Chip label="Linked" size="small" color="success" />
              )}
            </Paper>
          ))}
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            onClick={() => void handleClaimAll()}
            disabled={claimLoading}
            startIcon={claimLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {claimLoading ? "Linking…" : "Link to my account"}
          </Button>
          <Button
            variant="text"
            onClick={() => navigate("/join")}
            sx={{ color: "text.secondary" }}
          >
            Skip for now
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box maxWidth={600} mx="auto" mt={8} textAlign="center">
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Welcome, {displayName}!
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={1}>
        What brings you to Matchamp?
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={5}>
        Tell us why you're here so we can point you in the right direction.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} justifyContent="center">
        <Card variant="outlined" sx={{ flex: 1, cursor: "pointer" }}>
          <CardActionArea
            onClick={() => void handleOrganiserChoice()}
            sx={{ p: 3, height: "100%" }}
          >
            <CardContent>
              <TrophyIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                I'm running a tournament
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create and manage events, pair players, and track results.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card variant="outlined" sx={{ flex: 1, cursor: "pointer" }}>
          <CardActionArea
            onClick={() => void handlePlayerChoice()}
            sx={{ p: 3, height: "100%" }}
          >
            <CardContent>
              <JoinIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                I'm playing in a tournament
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter the room code from your organiser to find your tournament and view your matches.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      </Stack>

      <Box mt={4}>
        <Button
          variant="text"
          onClick={() => navigate("/dashboard")}
          sx={{ color: "text.secondary" }}
        >
          Not sure yet — skip for now
        </Button>
      </Box>
    </Box>
  );
};

export default Welcome;
