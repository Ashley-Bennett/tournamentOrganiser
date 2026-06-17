import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import type { MatchWithPlayers } from "../../types/match";

interface Props {
  open: boolean;
  match: MatchWithPlayers | null;
  selectedWinner: string;
  setSelectedWinner: (v: string) => void;
  player1Wins: number;
  setPlayer1Wins: (v: number) => void;
  player2Wins: number;
  setPlayer2Wins: (v: number) => void;
  updatingMatch: boolean;
  getScoreValidationError: () => string | null;
  onSave: () => void;
  onClose: () => void;
  setError: (e: string | null) => void;
}

export default function ScoreDialog({
  open,
  match,
  selectedWinner,
  setSelectedWinner,
  player1Wins,
  setPlayer1Wins,
  player2Wins,
  setPlayer2Wins,
  updatingMatch,
  getScoreValidationError,
  onSave,
  onClose,
  setError,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record Match Result</DialogTitle>
      <DialogContent>
        {match && (
          <Box sx={{ pt: 2 }}>
            <Typography variant="body1" gutterBottom>
              <strong>Match:</strong> {match.player1_name} vs{" "}
              {match.player2_name || "Bye"}
            </Typography>
            <FormControl component="fieldset" sx={{ mt: 3, mb: 2 }}>
              <FormLabel component="legend">Select Winner</FormLabel>
              <RadioGroup
                value={selectedWinner}
                onChange={(e) => {
                  setSelectedWinner(e.target.value);
                  setError(null);
                }}
              >
                {match.player2_id && (
                  <>
                    <FormControlLabel
                      value="player1"
                      control={<Radio />}
                      label={match.player1_name}
                    />
                    <FormControlLabel
                      value="player2"
                      control={<Radio />}
                      label={match.player2_name}
                    />
                    <FormControlLabel
                      value="draw"
                      control={<Radio />}
                      label="Draw"
                    />
                  </>
                )}
                {!match.player2_id && (
                  <FormControlLabel
                    value="player1"
                    control={<Radio />}
                    label={`${match.player1_name} (Bye)`}
                    checked={true}
                  />
                )}
              </RadioGroup>
            </FormControl>
            {match.player2_id && selectedWinner !== "draw" && (
              <Box sx={{ mt: 3 }}>
                <FormLabel component="legend" sx={{ mb: 2 }}>
                  Game Wins
                </FormLabel>
                <Box display="flex" gap={2} alignItems="center">
                  <FormControl variant="outlined" sx={{ flex: 1 }}>
                    <InputLabel>{match.player1_name}</InputLabel>
                    <OutlinedInput
                      type="number"
                      value={player1Wins}
                      onChange={(e) => {
                        setPlayer1Wins(
                          Math.min(2, Math.max(0, parseInt(e.target.value, 10) || 0)),
                        );
                        setError(null);
                      }}
                      inputProps={{ min: 0, max: 2 }}
                      endAdornment={
                        <InputAdornment position="end">wins</InputAdornment>
                      }
                      label={match.player1_name}
                      error={
                        selectedWinner === "player1" &&
                        player1Wins <= player2Wins &&
                        player1Wins + player2Wins > 0
                      }
                    />
                  </FormControl>
                  <Typography variant="h6">-</Typography>
                  <FormControl variant="outlined" sx={{ flex: 1 }}>
                    <InputLabel>{match.player2_name}</InputLabel>
                    <OutlinedInput
                      type="number"
                      value={player2Wins}
                      onChange={(e) => {
                        setPlayer2Wins(
                          Math.min(2, Math.max(0, parseInt(e.target.value, 10) || 0)),
                        );
                        setError(null);
                      }}
                      inputProps={{ min: 0, max: 2 }}
                      endAdornment={
                        <InputAdornment position="end">wins</InputAdornment>
                      }
                      label={match.player2_name}
                      error={
                        selectedWinner === "player2" &&
                        player2Wins <= player1Wins &&
                        player1Wins + player2Wins > 0
                      }
                    />
                  </FormControl>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Score will be displayed as: {player1Wins}-{player2Wins}
                </Typography>
                {(() => {
                  const validationError = getScoreValidationError();
                  return validationError ? (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {validationError}
                    </Alert>
                  ) : null;
                })()}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={updatingMatch}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={updatingMatch || !selectedWinner || getScoreValidationError() !== null}
        >
          {updatingMatch ? "Saving..." : "Save Result"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
