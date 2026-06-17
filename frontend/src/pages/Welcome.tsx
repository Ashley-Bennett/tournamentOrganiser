import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Button,
  Stack,
} from "@mui/material";
import {
  EmojiEvents as TrophyIcon,
  QrCodeScanner as JoinIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";

const Welcome = () => {
  const navigate = useNavigate();
  const { displayName, updateProfile } = useAuth();
  const { workspaces } = useWorkspace();

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
    navigate("/join");
  };

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
