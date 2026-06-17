import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import type { MatchWithPlayers } from "../../types/match";
import { MATCH_STATUS } from "../../types/match";

interface Props {
  open: boolean;
  name: string;
  setName: (v: string) => void;
  matches: MatchWithPlayers[];
  adding: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

function computeInfoMessage(matches: MatchWithPlayers[]): string {
  const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round_number)) : 1;
  const currentRoundMs = matches.filter((m) => m.round_number === maxRound);
  const roundHasBegun = currentRoundMs.some(
    (m) =>
      m.status === MATCH_STATUS.PENDING ||
      (m.status === MATCH_STATUS.COMPLETED && m.player2_id !== null),
  );
  const roundComplete =
    currentRoundMs.length > 0 &&
    currentRoundMs.every(
      (m) => m.status === MATCH_STATUS.COMPLETED || m.status === MATCH_STATUS.BYE,
    );
  const preBeginRound = currentRoundMs.length > 0 && !roundHasBegun && !roundComplete;
  const existingByeInRound = !roundComplete ? currentRoundMs.find((m) => !m.player2_id) : null;

  if (preBeginRound) {
    if (existingByeInRound) {
      return `Round ${maxRound} hasn't started yet. The player will be paired with ${existingByeInRound.player1_name}, who currently has a bye.`;
    }
    return `Round ${maxRound} hasn't started yet. The player will be added as the bye for this round and enter the bracket from round ${maxRound + 1} onward.`;
  }
  if (roundHasBegun && !roundComplete) {
    if (existingByeInRound) {
      return `Round ${maxRound} is in progress. The player will be paired with ${existingByeInRound.player1_name}, who currently has a bye.`;
    }
    return `Round ${maxRound} is in progress. This player will receive a bye for round ${maxRound} and enter the bracket from round ${maxRound + 1} onward.`;
  }
  return `This player will join with 0 points and be included in the next round's pairings.`;
}

export default function LateEntryDialog({
  open,
  name,
  setName,
  matches,
  adding,
  onSubmit,
  onClose,
}: Props) {
  const infoMessage = computeInfoMessage(matches);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Late Entry</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {infoMessage}
        </Alert>
        <TextField
          autoFocus
          fullWidth
          label="Player Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) void onSubmit();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void onSubmit()}
          disabled={!name.trim() || adding}
        >
          {adding ? "Adding…" : "Add Player"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
