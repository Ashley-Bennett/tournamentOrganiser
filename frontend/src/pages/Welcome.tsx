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
  PersonOutline as PersonIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

const Welcome = () => {
  const navigate = useNavigate();
  const { displayName, updateProfile } = useAuth();

  const handleChoice = async (intent: "organiser" | "player", destination: string) => {
    await updateProfile({ onboarding_intent: intent });
    navigate(destination);
  };

  return (
    <Box maxWidth={600} mx="auto" mt={8} textAlign="center">
      <Typography variant="h4" gutterBottom>
        Welcome, {displayName}
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={5}>
        You can run events or track your results — or both, with one account.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} justifyContent="center">
        <Card variant="outlined" sx={{ flex: 1, cursor: "pointer" }}>
          <CardActionArea
            onClick={() => void handleChoice("organiser", "/dashboard")}
            sx={{ p: 3, height: "100%" }}
          >
            <CardContent>
              <TrophyIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                Run a tournament
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create and manage tournaments, pair players, and track results in your workspace.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card variant="outlined" sx={{ flex: 1, cursor: "pointer" }}>
          <CardActionArea
            onClick={() => void handleChoice("player", "/me")}
            sx={{ p: 3, height: "100%" }}
          >
            <CardContent>
              <PersonIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                Join or track tournaments
              </Typography>
              <Typography variant="body2" color="text.secondary">
                View your match history and stats across tournaments you participate in.
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
          Skip for now
        </Button>
      </Box>
    </Box>
  );
};

export default Welcome;
