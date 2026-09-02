import { useEffect, useState } from "react";
import {
  Alert,
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
import RecordHistory from "../../components/RecordHistory";
import { supabase } from "../../supabaseClient";

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
  /** Round currently being viewed, or null on the standings tab. */
  currentRound: number | null;
  /** Players who have a match in `currentRound`. */
  playersInRound: Set<string>;
  /** Players with a finished match against a real opponent. Their entry can no longer be deleted. */
  playersWithResults: Set<string>;
  busyPlayerId: string | null;
  onClose: () => void;
  onToggleDrop: (playerId: string, currentlyDropped: boolean) => void;
  onRemoveFromRound: (playerId: string, round: number) => void;
  onDeleteEntry: (playerId: string) => void;
  onClearLinkRequest: (playerId: string) => void;
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
  currentRound,
  playersInRound,
  playersWithResults,
  busyPlayerId,
  onClose,
  onToggleDrop,
  onRemoveFromRound,
  onDeleteEntry,
  onClearLinkRequest,
  onUpdateStaticSeat,
}: Props) {
  const [seatInputs, setSeatInputs] = useState<Map<string, string>>(new Map());
  // How many times each entry has been changed since it was created. Fetched
  // once per dialog rather than once per player, and used only to decide
  // whether a player gets a History control at all.
  const [changeCounts, setChangeCounts] = useState<Map<string, number> | null>(
    null,
  );

  useEffect(() => {
    if (!open || players.length === 0) {
      setChangeCounts(null);
      return;
    }
    let stale = false;
    void supabase
      .rpc("get_record_change_counts", {
        p_table_name: "tournament_players",
        p_record_ids: players.map((p) => p.id),
      })
      .then(({ data, error }) => {
        if (stale) return;
        if (error) {
          // Not worth surfacing: the panel is supplementary, and falling back
          // to "no history anywhere" is quieter than an error on every row.
          setChangeCounts(new Map());
          return;
        }
        const rows = (data ?? []) as { record_id: string; change_count: number }[];
        setChangeCounts(new Map(rows.map((r) => [r.record_id, r.change_count])));
      });
    return () => {
      stale = true;
    };
  }, [open, players]);

  const [pendingDropId, setPendingDropId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const nameOf = (id: string | null) =>
    players.find((p) => p.id === id)?.name ?? "this player";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage Players</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Dropped players keep their record but are excluded from future
          pairings. Taking someone out of a round leaves them in the tournament
          and gives their opponent a bye. Static seating keeps a player at a
          fixed table each round.
        </Typography>
        {players.map((player, idx) => {
          const standing = finalStandingsById.get(player.id);
          const isSaving = savingSeat === player.id;
          const isBusy = busyPlayerId === player.id;
          const canRemoveFromRound =
            currentRound !== null && playersInRound.has(player.id);
          const canDeleteEntry = !playersWithResults.has(player.id);
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
                  <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                    <Typography variant="body1">{player.name}</Typography>
                    {player.is_late_entry && (
                      <Chip
                        label="Late Entry"
                        size="small"
                        color="info"
                        variant="outlined"
                      />
                    )}
                    {player.link_requested_at && (
                      <Chip
                        label="Wants to link"
                        size="small"
                        color="warning"
                        variant="outlined"
                        onDelete={() => onClearLinkRequest(player.id)}
                        disabled={isBusy}
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
                  disabled={!!togglingDrop || isBusy}
                  sx={{ ml: 2, minWidth: 80 }}
                >
                  {togglingDrop === player.id ? "…" : player.dropped ? "Restore" : "Drop"}
                </Button>
              </Box>
              {player.link_requested_at && (
                <Typography variant="caption" color="warning.main" display="block" mt={0.5}>
                  Someone tried to sign up as this player. Send them a claim link
                  from the tournament page, or dismiss the flag.
                </Typography>
              )}
              {/* Bottom row: static seating toggle + table number input */}
              <Box display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
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
                <Box flexGrow={1} />
                {canRemoveFromRound && (
                  <Button
                    size="small"
                    color="warning"
                    disabled={isBusy}
                    onClick={() => setPendingRemoveId(player.id)}
                  >
                    Take out of Round {currentRound}
                  </Button>
                )}
                {canDeleteEntry && (
                  <Button
                    size="small"
                    color="error"
                    disabled={isBusy}
                    onClick={() => setPendingDeleteId(player.id)}
                  >
                    Delete entry
                  </Button>
                )}
              </Box>

              <RecordHistory
                table="tournament_players"
                recordId={player.id}
                changeCount={changeCounts?.get(player.id) ?? 0}
              />
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

      <Dialog open={pendingRemoveId !== null} onClose={() => setPendingRemoveId(null)}>
        <DialogTitle>Take out of Round {currentRound}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {`"${nameOf(pendingRemoveId)}" will not play in Round ${currentRound}. Their opponent gets a bye for the round, and this player stays in the tournament and will be paired again next round.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRemoveId(null)}>Cancel</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              if (pendingRemoveId !== null && currentRound !== null) {
                onRemoveFromRound(pendingRemoveId, currentRound);
                setPendingRemoveId(null);
              }
            }}
          >
            Take out of round
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingDeleteId !== null} onClose={() => setPendingDeleteId(null)}>
        <DialogTitle>Delete this entry?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {`"${nameOf(pendingDeleteId)}" will be removed from the tournament completely, along with any pairing they are in. Any opponent gets a bye for that round.`}
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Use this for an entry that should never have existed, like the same
            person signed up twice. To take someone out who has been playing,
            drop them instead so their results are kept.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (pendingDeleteId !== null) {
                onDeleteEntry(pendingDeleteId);
                setPendingDeleteId(null);
              }
            }}
          >
            Delete entry
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
