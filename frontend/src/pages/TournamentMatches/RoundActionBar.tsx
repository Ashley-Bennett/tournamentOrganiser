import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RoundTimer from "../../components/RoundTimer";
import type { TournamentSummary } from "../../types/tournament";

interface Props {
  showPrePublish: boolean;
  showBeginRound: boolean;
  hasPendingMatches: boolean;
  allCompletedInDB: boolean;
  canShowNextRound: boolean;
  canProceedToNextRound: boolean;
  canCompleteTournament: boolean;
  editingPairings: boolean;
  savingPairings: boolean;
  pairingEditsValid: boolean;
  availablePool: Map<string, string>;
  processingRound: boolean;
  updatingMatch: boolean;
  allResultsEntered: boolean;
  currentRoundPendingCount: number;
  nextRoundAlreadyExists: boolean;
  tournament: TournamentSummary;
  savingTimer: boolean;
  wPath: (path: string) => string;
  onCancelEditPairings: () => void;
  onSavePairingEdits: () => void;
  onEditPairings: () => void;
  onPublishPairings: () => void;
  onBeginRound: () => void;
  onSubmitResults: () => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onToggleTimerEditor: () => void;
  onAddTimer: () => void;
  onNextRound: () => void;
  onCompleteTournament: () => void;
  onManagePlayers: () => void;
}

const pairingsUrl = (
  tournament: TournamentSummary,
  wPath: (p: string) => string,
) =>
  tournament.is_public && tournament.public_slug
    ? `/public/t/${tournament.public_slug}`
    : wPath(`/tournaments/${tournament.id}/pairings`);

export default function RoundActionBar({
  showPrePublish,
  showBeginRound,
  hasPendingMatches,
  allCompletedInDB,
  canShowNextRound,
  canProceedToNextRound,
  canCompleteTournament,
  editingPairings,
  savingPairings,
  pairingEditsValid,
  availablePool,
  processingRound,
  updatingMatch,
  allResultsEntered,
  currentRoundPendingCount,
  nextRoundAlreadyExists,
  tournament,
  savingTimer,
  wPath,
  onCancelEditPairings,
  onSavePairingEdits,
  onEditPairings,
  onPublishPairings,
  onBeginRound,
  onSubmitResults,
  onPauseTimer,
  onResumeTimer,
  onToggleTimerEditor,
  onAddTimer,
  onNextRound,
  onCompleteTournament,
  onManagePlayers,
}: Props) {
  const [savePairingsConfirmOpen, setSavePairingsConfirmOpen] = useState(false);
  const showBar =
    showPrePublish ||
    showBeginRound ||
    (hasPendingMatches && !allCompletedInDB) ||
    canProceedToNextRound ||
    canCompleteTournament ||
    editingPairings;

  if (!showBar) return null;

  return (
    <Box
      sx={{ mb: 2, display: "flex", justifyContent: "flex-end", gap: 1 }}
    >
      {editingPairings ? (
        <>
          <Button
            variant="outlined"
            onClick={onCancelEditPairings}
            disabled={savingPairings}
          >
            Cancel
          </Button>
          <Tooltip
            title={
              !pairingEditsValid && availablePool.size > 0
                ? `Assign ${[...availablePool.values()].join(", ")} before saving`
                : ""
            }
            arrow
          >
            <span>
              <Button
                variant="contained"
                color="success"
                disabled={!pairingEditsValid || savingPairings}
                onClick={() => setSavePairingsConfirmOpen(true)}
              >
                Save Pairings
              </Button>
            </span>
          </Tooltip>
        </>
      ) : (
        <>
          {/* Phase 1a: pairings ready, not yet published */}
          {showPrePublish && (
            <>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={onEditPairings}>
                Edit Pairings
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={onPublishPairings}
                disabled={processingRound}
              >
                Publish Pairings
              </Button>
            </>
          )}
          {/* Phase 1b: pairings published, round not yet started */}
          {showBeginRound && (
            <>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={onEditPairings}>
                Edit Pairings
              </Button>
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={() => window.open(pairingsUrl(tournament, wPath), "_blank")}
              >
                View Pairings
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PlayArrowIcon />}
                onClick={onBeginRound}
                disabled={processingRound}
              >
                Begin Round
              </Button>
            </>
          )}
          {/* Phase 2: round active */}
          {hasPendingMatches && !allCompletedInDB && (
            <>
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={() => window.open(pairingsUrl(tournament, wPath), "_blank")}
              >
                View Pairings
              </Button>
              <Tooltip
                title={!allResultsEntered ? "Enter all match results to submit" : ""}
                arrow
              >
                <span>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={!allResultsEntered || updatingMatch}
                    onClick={onSubmitResults}
                  >
                    {updatingMatch
                      ? "Saving…"
                      : `Submit Results (${currentRoundPendingCount})`}
                  </Button>
                </span>
              </Tooltip>
              {tournament.round_duration_minutes &&
                (tournament.current_round_started_at || tournament.round_is_paused) && (
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <RoundTimer
                      startedAt={tournament.current_round_started_at ?? null}
                      durationMinutes={tournament.round_duration_minutes}
                      elapsedSeconds={tournament.round_elapsed_seconds ?? 0}
                      isPaused={tournament.round_is_paused ?? false}
                      size="small"
                    />
                    <Tooltip
                      title={tournament.round_is_paused ? "Resume timer" : "Pause timer"}
                    >
                      <IconButton
                        size="small"
                        onClick={() =>
                          void (tournament.round_is_paused ? onResumeTimer() : onPauseTimer())
                        }
                      >
                        {tournament.round_is_paused ? (
                          <PlayArrowIcon sx={{ fontSize: "1rem" }} />
                        ) : (
                          <PauseIcon sx={{ fontSize: "1rem" }} />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit timer duration">
                      <IconButton size="small" onClick={onToggleTimerEditor}>
                        <EditIcon sx={{ fontSize: "1rem" }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              {!tournament.round_duration_minutes && (
                <Tooltip title="Add round timer">
                  <IconButton size="small" onClick={onAddTimer} disabled={savingTimer}>
                    <AccessTimeIcon sx={{ fontSize: "1rem" }} />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
          {/* Phase 3: round complete — keep View Pairings visible */}
          {allCompletedInDB && (
            <Button
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={() => window.open(pairingsUrl(tournament, wPath), "_blank")}
            >
              View Pairings
            </Button>
          )}
          {/* Phase 3 (non-final): results in DB */}
          {canShowNextRound && !nextRoundAlreadyExists && allCompletedInDB && (
            <Button variant="outlined" color="warning" onClick={onManagePlayers}>
              Manage Players
            </Button>
          )}
          {canShowNextRound && (nextRoundAlreadyExists || canProceedToNextRound) && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<ArrowForwardIcon />}
              onClick={onNextRound}
              disabled={processingRound}
            >
              {nextRoundAlreadyExists ? "View Next Round" : "Create Next Round"}
            </Button>
          )}
          {/* Phase 3 (final): results in DB */}
          {canCompleteTournament && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={onCompleteTournament}
              disabled={processingRound}
              sx={{ backgroundColor: "success.main", "&:hover": { backgroundColor: "success.dark" } }}
            >
              Complete Tournament
            </Button>
          )}
        </>
      )}

      <Dialog
        open={savePairingsConfirmOpen}
        onClose={() => setSavePairingsConfirmOpen(false)}
      >
        <DialogTitle>Save manual pairings?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Manually edited pairings can affect Swiss algorithm correctness for
            future rounds — repeat-opponent and colour-balance checks won't
            account for swaps made here. Only continue if you're sure.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSavePairingsConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setSavePairingsConfirmOpen(false);
              onSavePairingEdits();
            }}
          >
            Save Pairings
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
