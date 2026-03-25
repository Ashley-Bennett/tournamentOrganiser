import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Chip,
} from "@mui/material";
import { EmojiEventsOutlined as TrophyIcon } from "@mui/icons-material";
import { getAllEntries } from "../utils/playerStorage";

export default function DeviceTournaments() {
  const entries = useMemo(() => getAllEntries(), []);

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
      ) : (
        <Stack spacing={1.5}>
          {entries.map((e) => (
            <Paper
              key={e.tournamentId}
              variant="outlined"
              component={Link}
              to={`/t/${e.tournamentId}/me`}
              sx={{
                p: 2,
                textDecoration: "none",
                display: "block",
                "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                transition: "border-color 0.15s, background-color 0.15s",
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography variant="subtitle2" fontWeight={500} flexGrow={1}>
                  {e.tournamentName ?? "Tournament"}
                </Typography>
                <Chip label="View" size="small" variant="outlined" />
              </Stack>
            </Paper>
          ))}
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
