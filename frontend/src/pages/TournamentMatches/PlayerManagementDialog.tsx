import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { TournamentPlayer } from "../../types/match";

interface PlayerStanding {
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
}

interface Props {
  open: boolean;
  players: TournamentPlayer[];
  finalStandingsById: Map<string, PlayerStanding>;
  togglingDrop: string | null;
  savingSeat: string | null;
  onClose: () => void;
  onToggleDrop: (playerId: string, currentlyDropped: boolean) => void;
  onUpdateStaticSeat: (
    playerId: string,
    hasStaticSeating: boolean,
    seatNumber: number | null,
  ) => void;
}

export default function PlayerManagementDialog({
  open,
  players,
  finalStandingsById,
  togglingDrop,
  savingSeat,
  onClose,
  onToggleDrop,
  onUpdateStaticSeat,
}: Props) {
  const [seatInputs, setSeatInputs] = useState<Map<string, string>>(new Map());
  const [pendingDropId, setPendingDropId] = useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage Players</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Dropped players keep their record but are excluded from future
          pairings. Static seating keeps a player at a fixed table each round.
        </Typography>
        {players.map((player, idx) => {
          const standing = finalStandingsById.get(player.id);
          const isSaving = savingSeat === player.id;
          return (
            <Box
              key={player.id}
              py={1.5}
              sx={{
                borderBottom: idx < players.length - 1 ? "1px solid" : "none",
                borderColor: "divider",
                opacity: player.dropped ? 0.65 : 1,
              }}
            >
              {/* Top row: name + record + drop button */}
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body1">{player.name}</Typography>
                    {player.is_late_entry && (
                      <Chip
                        label="Late Entry"
                        size="small"
                        color="info"
                        variant="outlined"
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {player.dropped
                      ? `Dropped after Round ${player.dropped_at_round}`
                      : `${standing?.wins ?? 0}W – ${standing?.losses ?? 0}L – ${standing?.draws ?? 0}D · ${standing?.matchPoints ?? 0} pts`}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color={player.dropped ? "success" : "error"}
                  onClick={() =>
                    player.dropped
                      ? onToggleDrop(player.id, true)
                      : setPendingDropId(player.id)
                  }
                  disabled={!!togglingDrop}
                  sx={{ ml: 2, minWidth: 80 }}
                >
                  {togglingDrop === player.id ? "…" : player.dropped ? "Restore" : "Drop"}
                </Button>
              </Box>
              {/* Bottom row: static seating toggle + table number input */}
              <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={player.has_static_seating}
                      disabled={isSaving}
                      onChange={(e) =>
                        onUpdateStaticSeat(
                          player.id,
                          e.target.checked,
                          player.static_seat_number,
                        )
                      }
                    />
                  }
                  label={<Typography variant="caption">Static seating</Typography>}
                  sx={{ mr: 0 }}
                />
                {player.has_static_seating && (
                  <TextField
                    size="small"
                    label="Table #"
                    type="number"
                    disabled={isSaving}
                    value={
                      seatInputs.has(player.id)
                        ? seatInputs.get(player.id)!
                        : (player.static_seat_number?.toString() ?? "")
                    }
                    onChange={(e) => {
                      setSeatInputs((prev) => new Map(prev).set(player.id, e.target.value));
                    }}
                    onBlur={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      const val =
                        e.target.value === "" || isNaN(parsed) ? null : parsed;
                      setSeatInputs((prev) => {
                        const next = new Map(prev);
                        next.delete(player.id);
                        return next;
                      });
                      if (val !== player.static_seat_number) {
                        onUpdateStaticSeat(player.id, true, val);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    inputProps={{ min: 1, style: { width: 60 } }}
                    sx={{ width: 90 }}
                  />
                )}
                {isSaving && (
                  <Typography variant="caption" color="text.secondary">
                    Saving…
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      <Dialog open={pendingDropId !== null} onClose={() => setPendingDropId(null)}>
        <DialogTitle>Drop player?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(() => {
              const p = players.find((pl) => pl.id === pendingDropId);
              return p
                ? `Drop "${p.name}" from the tournament? They will keep their record but be excluded from future pairings.`
                : "Drop this player from the tournament?";
            })()}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDropId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (pendingDropId !== null) {
                onToggleDrop(pendingDropId, false);
                setPendingDropId(null);
              }
            }}
          >
            Drop Player
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
