import {
  Box,
  Typography,
  Paper,
  Divider,
  Stack,
} from "@mui/material";
import {
  PersonOutline as PersonIcon,
  EmojiEventsOutlined as TrophyIcon,
} from "@mui/icons-material";
import { useAuth } from "../AuthContext";

const Me = () => {
  const { user, displayName } = useAuth();

  return (
    <Box maxWidth={600} mx="auto" mt={4}>
      <Typography variant="h4" gutterBottom>
        My Profile
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <PersonIcon sx={{ fontSize: 40, color: "text.secondary" }} />
          <Box>
            <Typography variant="h6">{displayName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Divider sx={{ mb: 3 }} />

      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <TrophyIcon sx={{ color: "text.secondary" }} />
        <Typography variant="h6">My Tournaments</Typography>
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          p: 4,
          textAlign: "center",
          backgroundColor: "action.hover",
        }}
      >
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No tournament history yet.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your match history will appear here once your entries are linked to your account.
          Ask the tournament organiser to link you, or claim entries from a past event.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Me;
