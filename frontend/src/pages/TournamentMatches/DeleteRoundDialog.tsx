import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

interface Props {
  roundNumber: number | null;
  onConfirm: (round: number) => void;
  onClose: () => void;
}

export default function DeleteRoundDialog({
  roundNumber,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Dialog open={roundNumber !== null} onClose={onClose}>
      <DialogTitle>Remove Round {roundNumber}?</DialogTitle>
      <DialogContent>
        <Typography>
          This will permanently delete all pairings and match results for Round{" "}
          {roundNumber}. The tournament will end after Round{" "}
          {(roundNumber ?? 1) - 1}.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => {
            if (roundNumber !== null) {
              onConfirm(roundNumber);
              onClose();
            }
          }}
        >
          Remove Round
        </Button>
      </DialogActions>
    </Dialog>
  );
}
