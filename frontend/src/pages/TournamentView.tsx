import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Button,
  Box,
  Paper,
  Chip,
  Alert,
  TextField,
  FormControlLabel,
  Checkbox,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { PlayArrow as PlayArrowIcon } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import PageLoading from "../components/PageLoading";
import TournamentPageHeader from "../components/TournamentPageHeader";
import { useTournament } from "../hooks/useTournament";
import { useTournamentPlayers } from "../hooks/useTournamentPlayers";
import type { TournamentSummary, TournamentPlayer } from "../types/tournament";
import { formatDateTime } from "../utils/format";
import {
  getTournamentTypeLabel,
  calculateSuggestedRounds,
} from "../utils/tournamentUtils";
import { generateRound1Pairings } from "../utils/tournamentPairing";

const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { tournament, setTournament, loading, error, setError } = useTournament(
    id,
    user,
    authLoading,
  );
  const {
    players,
    setPlayers,
    loading: playersLoading,
    error: playersError,
    setError: setPlayersError,
  } = useTournamentPlayers(tournament?.id);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [addingBulk, setAddingBulk] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);
  const [confirmDeletePlayerId, setConfirmDeletePlayerId] = useState<string | null>(null);
  const [startingTournament, setStartingTournament] = useState(false);
  const [numRounds, setNumRounds] = useState<number | null>(null);
  const [useSuggestedRounds, setUseSuggestedRounds] = useState(true);
  const playerNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (tournament) {
      setNumRounds(tournament.num_rounds);
      setUseSuggestedRounds(tournament.num_rounds === null);
    }
  }, [tournament]);

  const suggestedRounds = tournament
    ? calculateSuggestedRounds(players.length, tournament.tournament_type)
    : 0;

  useEffect(() => {
    if (useSuggestedRounds && tournament && players.length >= 2) {
      const suggested = calculateSuggestedRounds(
        players.length,
        tournament.tournament_type,
      );
      if (suggested !== numRounds) {
        setNumRounds(suggested);
      }
    }
  }, [useSuggestedRounds, players.length, tournament, numRounds]);

  const handleAddPlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlayerName.trim() || !tournament || !user) return;

    try {
      setAddingPlayer(true);
      setPlayersError(null);

      const { data, error } = await supabase
        .from("tournament_players")
        .insert({
          name: newPlayerName.trim(),
          tournament_id: tournament.id,
          created_by: user.id,
        })
        .select("id, name, created_at")
        .single();

      if (error) {
        throw new Error(error.message || "Failed to add player");
      }

      setPlayers((prev) => [...prev, data as TournamentPlayer]);
      setNewPlayerName("");
      playerNameInputRef.current?.focus();
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to add player");
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!tournament || !user) return;
    const names = bulkNames
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;

    setAddingBulk(true);
    setPlayersError(null);
    try {
      const inserts = names.map((name) => ({
        name,
        tournament_id: tournament.id,
        created_by: user.id,
      }));
      const { data, error } = await supabase
        .from("tournament_players")
        .insert(inserts)
        .select("id, name, created_at");

      if (error) throw new Error(error.message || "Failed to add players");

      setPlayers((prev) => [...prev, ...(data as TournamentPlayer[])]);
      setBulkNames("");
      setBulkMode(false);
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to add players");
    } finally {
      setAddingBulk(false);
    }
  };

  const handleSaveRounds = async () => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    if (!numRounds || numRounds < 1) return;

    try {
      setError(null);

      const { data, error } = await supabase
        .from("tournaments")
        .update({ num_rounds: numRounds })
        .eq("id", tournament.id)
        .eq("created_by", user.id)
        .select(
          "id, name, status, tournament_type, num_rounds, created_at, created_by",
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to save rounds");
      }

      if (data) {
        setTournament(data as TournamentSummary);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save rounds");
    }
  };

  const handleDeletePlayer = (playerId: string) => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    setConfirmDeletePlayerId(playerId);
  };

  const handleConfirmDeletePlayer = async () => {
    const playerId = confirmDeletePlayerId;
    if (!playerId || !tournament || !user) return;
    setConfirmDeletePlayerId(null);

    try {
      setDeletingPlayerId(playerId);
      setPlayersError(null);

      const { error } = await supabase
        .from("tournament_players")
        .delete()
        .eq("id", playerId)
        .eq("tournament_id", tournament.id)
        .eq("created_by", user.id);

      if (error) {
        throw new Error(error.message || "Failed to delete player");
      }

      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    } catch (e: unknown) {
      setPlayersError(
        e instanceof Error ? e.message : "Failed to delete player",
      );
    } finally {
      setDeletingPlayerId(null);
    }
  };

  const handleStartTournament = async () => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    if (players.length < 2) return;
    if (!numRounds || numRounds < 1) return;

    try {
      setStartingTournament(true);
      setError(null);

      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .update({ status: "active", num_rounds: numRounds })
        .eq("id", tournament.id)
        .eq("created_by", user.id)
        .select(
          "id, name, status, tournament_type, num_rounds, created_at, created_by",
        )
        .maybeSingle();

      if (tournamentError) {
        throw new Error(
          tournamentError.message || "Failed to start tournament",
        );
      }

      if (!tournamentData) {
        throw new Error("Failed to update tournament");
      }

      const pairings = generateRound1Pairings(
        tournament.tournament_type,
        players,
      );

      if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        throw new Error(
          `No pairings generated. Got: ${typeof pairings}, length: ${pairings?.length}`,
        );
      }

      const matchesToInsert = pairings.map((pairing) => ({
        tournament_id: tournament.id,
        round_number: 1,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: pairing.player2Id === null ? "bye" : "ready",
        result: pairing.player2Id === null ? "bye" : null,
        winner_id: pairing.player2Id === null ? pairing.player1Id : null,
      }));

      const { data: insertedMatches, error: matchesError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert)
        .select();

      if (matchesError) {
        await supabase
          .from("tournaments")
          .update({ status: "draft" })
          .eq("id", tournament.id);
        throw new Error(
          `Failed to create round 1 matches: ${matchesError.message}`,
        );
      }

      if (!insertedMatches || insertedMatches.length === 0) {
        await supabase
          .from("tournaments")
          .update({ status: "draft" })
          .eq("id", tournament.id);
        throw new Error(
          `Failed to create matches - expected ${matchesToInsert.length} matches but got ${insertedMatches?.length ?? 0}`,
        );
      }

      setTournament(tournamentData as TournamentSummary);
      navigate(`/tournaments/${tournamentData.id}/matches`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start tournament");
    } finally {
      setStartingTournament(false);
    }
  };

  if (authLoading || loading) {
    return <PageLoading />;
  }

  if (error || !tournament) {
    return (
      <Box>
        <TournamentPageHeader
          title="Tournament"
          onBack={() => navigate("/tournaments")}
        />
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <TournamentPageHeader
        title={tournament.name}
        onBack={() => navigate("/tournaments")}
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          mb={1}
        >
          <Typography variant="subtitle1" gutterBottom>
            Basic Details
          </Typography>
          {tournament.status !== "draft" && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate(`/tournaments/${tournament.id}/matches`)}
            >
              View matches
            </Button>
          )}
        </Box>
        <Box display="flex" flexDirection="column" gap={1}>
          <Box display="flex" gap={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Status:
            </Typography>
            <Chip label={tournament.status} size="small" />
          </Box>
          <Box display="flex" gap={1}>
            <Typography variant="body2" color="text.secondary">
              Type:
            </Typography>
            <Typography variant="body2">
              {getTournamentTypeLabel(tournament.tournament_type)}
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Typography variant="body2" color="text.secondary">
              Created at:
            </Typography>
            <Typography variant="body2">
              {formatDateTime(tournament.created_at)}
            </Typography>
          </Box>
          {tournament.num_rounds && tournament.status !== "draft" && (
            <Box display="flex" gap={1}>
              <Typography variant="body2" color="text.secondary">
                Number of Rounds:
              </Typography>
              <Typography variant="body2">{tournament.num_rounds}</Typography>
            </Box>
          )}
        </Box>
        {tournament.status === "draft" && (
          <Box mt={2} display="flex" flexDirection="column" gap={2}>
            <Box display="flex" flexDirection="column" gap={1}>
              <Typography variant="subtitle2" gutterBottom>
                Number of Rounds
              </Typography>
              {tournament.num_rounds && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Currently set to: {tournament.num_rounds} rounds
                </Typography>
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useSuggestedRounds}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setUseSuggestedRounds(checked);
                      if (
                        checked &&
                        tournament &&
                        players.length >= 2 &&
                        user
                      ) {
                        const suggested = calculateSuggestedRounds(
                          players.length,
                          tournament.tournament_type,
                        );
                        if (suggested > 0) {
                          setNumRounds(suggested);
                          const { data, error } = await supabase
                            .from("tournaments")
                            .update({ num_rounds: suggested })
                            .eq("id", tournament.id)
                            .eq("created_by", user.id)
                            .select(
                              "id, name, status, tournament_type, num_rounds, created_at, created_by",
                            )
                            .maybeSingle();
                          if (!error && data) {
                            setTournament(data as TournamentSummary);
                          }
                        }
                      }
                    }}
                  />
                }
                label={
                  players.length >= 2
                    ? `Use suggested rounds (${suggestedRounds} rounds for ${players.length} players)`
                    : "Use suggested rounds (add players to see suggestion)"
                }
              />
              {!useSuggestedRounds && (
                <Box display="flex" gap={1} alignItems="flex-start">
                  <TextField
                    type="number"
                    label="Number of Rounds"
                    value={numRounds || ""}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      setNumRounds(isNaN(value) ? null : Math.max(1, value));
                    }}
                    inputProps={{ min: 1, max: 20 }}
                    size="small"
                    sx={{ maxWidth: 200 }}
                    helperText={
                      players.length >= 2
                        ? `Suggested: ${suggestedRounds} rounds`
                        : "Add at least 2 players to see suggested rounds"
                    }
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleSaveRounds}
                    disabled={!numRounds || numRounds < 1}
                    sx={{ mt: 0.5 }}
                  >
                    Save
                  </Button>
                </Box>
              )}
              {useSuggestedRounds && players.length >= 2 && (
                <Typography variant="body2" color="text.secondary">
                  {tournament.tournament_type === "single_elimination"
                    ? `Single elimination requires ${suggestedRounds} rounds for ${players.length} players.`
                    : `Swiss tournament typically uses ${suggestedRounds} rounds for ${players.length} players.`}
                </Typography>
              )}
            </Box>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={handleStartTournament}
              disabled={
                startingTournament ||
                players.length < 2 ||
                !numRounds ||
                numRounds < 1
              }
            >
              Start tournament
            </Button>
            <Typography variant="caption" color="text.secondary">
              {players.length < 2
                ? "Add at least 2 players before starting."
                : !numRounds || numRounds < 1
                  ? "Set the number of rounds before starting."
                  : "Once started, players can no longer be removed."}
            </Typography>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Players ({players.length})
        </Typography>
        {playersError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {playersError}
          </Alert>
        )}
        {!bulkMode ? (
          <Box
            component="form"
            onSubmit={handleAddPlayer}
            display="flex"
            gap={2}
            mb={2}
            flexWrap="wrap"
            alignItems="flex-start"
          >
            <TextField
              label="Player name"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              size="small"
              sx={{ minWidth: 240 }}
              inputRef={playerNameInputRef}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={addingPlayer || !newPlayerName.trim()}
            >
              Add Player
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setBulkMode(true)}
              sx={{ alignSelf: "center" }}
            >
              Bulk add
            </Button>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={1} mb={2}>
            <TextField
              label="One name per line"
              multiline
              minRows={4}
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
              size="small"
              placeholder={"Alice\nBob\nCharlie"}
              autoFocus
            />
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                onClick={() => void handleBulkAdd()}
                disabled={
                  addingBulk ||
                  bulkNames
                    .split("\n")
                    .map((n) => n.trim())
                    .filter((n) => n.length > 0).length === 0
                }
              >
                {addingBulk
                  ? "Adding…"
                  : `Add ${
                      bulkNames
                        .split("\n")
                        .map((n) => n.trim())
                        .filter((n) => n.length > 0).length
                    } Players`}
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setBulkMode(false);
                  setBulkNames("");
                }}
                disabled={addingBulk}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        )}

        {playersLoading ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        ) : players.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No players added yet. Add your first player above.
          </Typography>
        ) : (
          <Box display="flex" flexDirection="column" gap={1}>
            {players.map((player) => (
              <Box
                key={player.id}
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                py={0.5}
                borderBottom="1px solid"
                borderColor="divider"
              >
                <Typography variant="body2">{player.name}</Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Joined {formatDateTime(player.created_at)}
                  </Typography>
                  {tournament.status === "draft" && (
                    <IconButton
                      size="small"
                      color="error"
                      aria-label="Remove player"
                      onClick={() => handleDeletePlayer(player.id)}
                      disabled={deletingPlayerId === player.id}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <Dialog
        open={confirmDeletePlayerId !== null}
        onClose={() => setConfirmDeletePlayerId(null)}
      >
        <DialogTitle>Remove player?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(() => {
              const player = players.find((p) => p.id === confirmDeletePlayerId);
              return player
                ? `Remove "${player.name}" from the tournament? This cannot be undone.`
                : "Remove this player from the tournament? This cannot be undone.";
            })()}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeletePlayerId(null)}>Cancel</Button>
          <Button color="error" onClick={() => void handleConfirmDeletePlayer()}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TournamentView;
