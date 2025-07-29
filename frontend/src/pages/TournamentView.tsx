import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Button,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Autocomplete,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
  Add as AddIcon,
  Leaderboard as LeaderboardIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";

interface Tournament {
  id: number;
  name: string;
  date: string;
  league_name?: string;
  bracket_type: string;
  status: "new" | "active" | "completed";
  created_at: string;
  updated_at?: string;
}

interface Match {
  id: number;
  tournament_id: number;
  round_number: number;
  player1_id: number;
  player2_id: number;
  player1_name: string;
  player2_name: string;
  winner_id: number | null;
  winner_name: string | null;
  result: string | null;
  round_status: string;
  created_at: string;
}

interface Player {
  id: number;
  name: string;
  static_seating: boolean;
  created_at: string;
}

interface TournamentPlayer {
  id: number;
  name: string;
  static_seating: boolean;
  dropped: boolean;
  started_round: number;
  created_at: string;
  trainer_id?: string;
  birth_year?: number;
}

interface LeaderboardEntry {
  id: number;
  name: string;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  opponent_resistance: number;
  opponent_opponent_resistance: number;
}

const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournamentPlayers, setTournamentPlayers] = useState<
    TournamentPlayer[]
  >([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [mainTabValue, setMainTabValue] = useState(0);
  const [openCreateMatchDialog, setOpenCreateMatchDialog] = useState(false);
  const [openPairingOptionsDialog, setOpenPairingOptionsDialog] =
    useState(false);
  const [openAddPlayerDialog, setOpenAddPlayerDialog] = useState(false);
  const [openCreatePlayerDialog, setOpenCreatePlayerDialog] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [createMatchForm, setCreateMatchForm] = useState({
    round_number: 1,
    player1_id: "",
    player2_id: "",
  });
  const [addPlayerForm, setAddPlayerForm] = useState({
    selectedPlayers: [] as Player[],
    started_round: 1,
  });
  const [addPlayerFormError, setAddPlayerFormError] = useState<string | null>(
    null
  );
  const [createPlayerForm, setCreatePlayerForm] = useState({
    name: "",
    static_seating: false,
    trainer_id: "",
    birth_year: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const [creatingPairings, setCreatingPairings] = useState(false);
  const [updatingMatchResult, setUpdatingMatchResult] = useState<number | null>(
    null
  );
  const [recentlyUpdatedMatch, setRecentlyUpdatedMatch] = useState<
    number | null
  >(null);
  const [endingTournament, setEndingTournament] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<number | null>(null);
  const [removingAllPlayers, setRemovingAllPlayers] = useState(false);
  // Add state for edit dialog and player being edited
  const [openEditPlayerDialog, setOpenEditPlayerDialog] = useState(false);
  const [editPlayerForm, setEditPlayerForm] = useState({
    id: null as number | null,
    name: "",
    static_seating: false,
    trainer_id: "",
    birth_year: "",
    dropped: false,
    started_round: 1,
  });
  const [editingPlayer, setEditingPlayer] = useState<TournamentPlayer | null>(
    null
  );
  const [editing, setEditing] = useState(false);
  // Add state for dropped confirmation dialog
  const [droppedConfirm, setDroppedConfirm] = useState<{
    player: TournamentPlayer | null;
    newDropped: boolean;
  }>({ player: null, newDropped: false });
  const [droppedLoading, setDroppedLoading] = useState(false);
  const [roundStatuses, setRoundStatuses] = useState<Record<number, string>>(
    {}
  );
  const [startingRound, setStartingRound] = useState<number | null>(null);
  const [completingRound, setCompletingRound] = useState<number | null>(null);
  const [openEditMatchDialog, setOpenEditMatchDialog] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editMatchForm, setEditMatchForm] = useState({
    player1_id: "",
    player2_id: "",
  });
  const [editingMatchLoading, setEditingMatchLoading] = useState(false);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);

  const fetchTournamentData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch tournament details
      const tournamentResponse = await fetch(
        `http://localhost:3002/api/tournaments/${id}`
      );
      if (!tournamentResponse.ok) {
        throw new Error("Tournament not found");
      }
      const tournamentData = await tournamentResponse.json();
      setTournament(tournamentData);

      // Fetch tournament matches
      const matchesResponse = await fetch(
        `http://localhost:3002/api/tournaments/${id}/matches`
      );
      if (matchesResponse.ok) {
        const matchesData = await matchesResponse.json();
        setMatches(matchesData);
      }
    } catch (error) {
      setError("Failed to load tournament data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchPlayers = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3002/api/players");
      if (response.ok) {
        const data = await response.json();
        setPlayers(data);
      }
    } catch (error) {
      console.error("Error fetching players:", error);
    }
  }, []);

  const fetchTournamentPlayers = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/players`
      );
      if (response.ok) {
        const data = await response.json();
        setTournamentPlayers(data);
      }
    } catch (error) {
      console.error("Error fetching tournament players:", error);
    }
  }, [id]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/leaderboard`
      );
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data);
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchTournamentData();
      fetchPlayers();
      fetchTournamentPlayers();
      fetchLeaderboard();
    }
  }, [
    id,
    fetchTournamentData,
    fetchPlayers,
    fetchTournamentPlayers,
    fetchLeaderboard,
  ]);

  const handleStartRound = async (roundNumber: number) => {
    setStartingRound(roundNumber);
    setError(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/rounds/${roundNumber}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (response.ok) {
        setSuccess("Round started successfully!");
        setTimeout(() => setSuccess(null), 3000);
        await fetchTournamentData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to start round");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setStartingRound(null);
    }
  };

  const handleCompleteRound = async (roundNumber: number) => {
    setCompletingRound(roundNumber);
    setError(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/rounds/${roundNumber}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (response.ok) {
        setSuccess("Round completed successfully!");
        setTimeout(() => setSuccess(null), 3000);
        await fetchTournamentData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to complete round");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setCompletingRound(null);
    }
  };

  const handleDeleteMatch = async (matchId: number) => {
    if (!window.confirm("Are you sure you want to delete this match?")) return;

    setDeletingMatchId(matchId);
    setError(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/matches/${matchId}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        setSuccess("Match deleted successfully!");
        setTimeout(() => setSuccess(null), 3000);
        await fetchTournamentData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to delete match");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setDeletingMatchId(null);
    }
  };

  const handleEditMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingMatch) return;

    setEditingMatchLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/matches/${editingMatch.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player1_id: editMatchForm.player1_id
              ? parseInt(editMatchForm.player1_id)
              : null,
            player2_id: editMatchForm.player2_id
              ? parseInt(editMatchForm.player2_id)
              : null,
          }),
        }
      );
      if (response.ok) {
        setSuccess("Match updated successfully!");
        setTimeout(() => setSuccess(null), 3000);
        setOpenEditMatchDialog(false);
        setEditingMatch(null);
        setEditMatchForm({ player1_id: "", player2_id: "" });
        await fetchTournamentData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update match");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setEditingMatchLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getCompletionColor = (isCompleted: boolean) => {
    return isCompleted ? "success" : "warning";
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case "WIN_P1":
        return "success";
      case "WIN_P2":
        return "success";
      case "DRAW":
        return "warning";
      case "BYE":
        return "info";
      default:
        return "default";
    }
  };

  const getResultLabel = (result: string) => {
    switch (result) {
      case "WIN_P1":
        return "Player 1 Wins";
      case "WIN_P2":
        return "Player 2 Wins";
      case "DRAW":
        return "Draw";
      case "BYE":
        return "Bye";
      default:
        return "Pending";
    }
  };

  const getBracketTypeLabel = (bracketType: string) => {
    switch (bracketType) {
      case "SWISS":
        return "Swiss System";
      case "SINGLE_ELIMINATION":
        return "Single Elimination";
      case "DOUBLE_ELIMINATION":
        return "Double Elimination";
      default:
        return bracketType;
    }
  };

  // Check if all matches in a round have results
  const hasAllResultsForRound = (roundNumber: number) => {
    const roundMatches = matchesByRound[roundNumber] || [];
    return (
      roundMatches.length > 0 &&
      roundMatches.every((match) => match.result && match.result !== "")
    );
  };

  // Check if the current round is the active round and all results are in
  const canCreateNextRound = () => {
    if (!activeRound) return false;
    return hasAllResultsForRound(activeRound);
  };

  // Group matches by round - memoized to prevent unnecessary recalculations
  const matchesByRound = useMemo(() => {
    return matches.reduce((acc, match) => {
      const round = match.round_number;
      if (!acc[round]) {
        acc[round] = [];
      }
      acc[round].push(match);
      return acc;
    }, {} as Record<number, Match[]>);
  }, [matches]);

  // Get all round numbers sorted - memoized to prevent unnecessary recalculations
  const roundNumbers = useMemo(() => {
    return Object.keys(matchesByRound)
      .map(Number)
      .sort((a, b) => a - b);
  }, [matchesByRound]);

  // Determine the active round (highest round number, but only if tournament is not completed)
  const activeRound =
    roundNumbers.length > 0 && tournament?.status !== "completed"
      ? Math.max(...roundNumbers)
      : null;

  // Set selected round to highest round on initial load and when new matches are created
  useEffect(() => {
    if (roundNumbers.length > 0) {
      const maxRound = Math.max(...roundNumbers);
      // Set to max round if no round is selected, or if we're on the active round and new matches were created
      if (
        selectedRound === null ||
        (selectedRound === activeRound && activeRound !== null)
      ) {
        setSelectedRound(maxRound);
      }
    }
  }, [roundNumbers, selectedRound, activeRound]);

  // Use tournament.status for tab logic
  useEffect(() => {
    if (!tournament) return;
    if (tournament.status === "completed") {
      setMainTabValue(2); // Leaderboard
    } else if (tournament.status === "active") {
      setMainTabValue(1); // Matches
    } else {
      setMainTabValue(0); // Players
    }
  }, [tournament]);

  // Fetch round statuses when round numbers change
  useEffect(() => {
    const fetchRoundStatuses = async () => {
      try {
        const statuses: Record<number, string> = {};
        for (const round of roundNumbers) {
          const response = await fetch(
            `http://localhost:3002/api/tournaments/${id}/rounds/${round}/status`
          );
          if (response.ok) {
            const data = await response.json();
            statuses[round] = data.status;
          }
        }
        setRoundStatuses(statuses);
      } catch (error) {
        console.error("Error fetching round statuses:", error);
      }
    };

    if (roundNumbers.length > 0) {
      fetchRoundStatuses();
    }
  }, [id, roundNumbers]);

  // Use tournament.status for status chip
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "active":
        return "Active";
      case "new":
        return "New";
      default:
        return status;
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "active":
        return "warning";
      case "new":
        return "info";
      default:
        return "default";
    }
  };

  const handleCreateMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/matches`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            round_number: createMatchForm.round_number,
            player1_id: createMatchForm.player1_id
              ? parseInt(createMatchForm.player1_id)
              : null,
            player2_id: createMatchForm.player2_id
              ? parseInt(createMatchForm.player2_id)
              : null,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log("Match created:", result);
        setOpenCreateMatchDialog(false);
        setCreateMatchForm({
          round_number: 1,
          player1_id: "",
          player2_id: "",
        });
        fetchTournamentData(); // Refresh the tournament data
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create match");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAutomaticPairings = async () => {
    setCreatingPairings(true);
    setError(null);

    try {
      const roundNumber =
        matches.length === 0 ? 1 : Math.max(...roundNumbers) + 1;

      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/pairings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            round_number: roundNumber,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log("Automatic pairings created:", result);
        setOpenPairingOptionsDialog(false);
        setSuccess("Automatic pairings created successfully!");
        setTimeout(() => setSuccess(null), 5000);

        // Refresh tournament data and then set the selected round to the latest
        await fetchTournamentData();

        // Set the selected round to the round we just created
        setSelectedRound(roundNumber);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create automatic pairings");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setCreatingPairings(false);
    }
  };

  const handlePairingOptionSelect = (option: "automatic" | "custom") => {
    setOpenPairingOptionsDialog(false);
    if (option === "automatic") {
      handleCreateAutomaticPairings();
    } else {
      setOpenCreateMatchDialog(true);
    }
  };

  const handleUpdateMatchResult = async (matchId: number, result: string) => {
    setUpdatingMatchResult(matchId);
    setError(null);

    try {
      let winnerId = null;
      if (result === "WIN_P1") {
        const match = matches.find((m) => m.id === matchId);
        winnerId = match?.player1_id || null;
      } else if (result === "WIN_P2") {
        const match = matches.find((m) => m.id === matchId);
        winnerId = match?.player2_id || null;
      }

      const response = await fetch(
        `http://localhost:3002/api/matches/${matchId}/result`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            result,
            winner_id: winnerId,
            modified_by_to: true,
          }),
        }
      );

      if (response.ok) {
        console.log("Match result updated successfully");

        // Update local state instead of refetching all data
        setMatches((prevMatches) =>
          prevMatches.map((match) =>
            match.id === matchId
              ? {
                  ...match,
                  result,
                  winner_id: winnerId,
                  winner_name:
                    result === "WIN_P1"
                      ? match.player1_name
                      : result === "WIN_P2"
                      ? match.player2_name
                      : null,
                }
              : match
          )
        );

        // Show subtle visual feedback
        setRecentlyUpdatedMatch(matchId);
        setTimeout(() => setRecentlyUpdatedMatch(null), 2000);

        // Refresh leaderboard data
        fetchLeaderboard();

        // Clear any previous errors
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update match result");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setUpdatingMatchResult(null);
    }
  };

  const handleAddPlayer = async (event: React.FormEvent) => {
    event.preventDefault();

    // Validate that at least one player is selected
    if (addPlayerForm.selectedPlayers.length === 0) {
      setAddPlayerFormError("Please select at least one player");
      return;
    }

    setAddPlayerFormError(null);
    setAddingPlayer(true);

    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/players/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            players: addPlayerForm.selectedPlayers.map((player) => player.id),
            started_round: addPlayerForm.started_round,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log(
          "Players added to tournament successfully:",
          result.message
        );
        setOpenAddPlayerDialog(false);
        setAddPlayerForm({
          selectedPlayers: [],
          started_round: 1,
        });
        setAddPlayerFormError(null);
        fetchTournamentPlayers(); // Refresh the tournament players
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to add players to tournament");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleCreatePlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingPlayer(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: any = {
        name: createPlayerForm.name,
        static_seating: createPlayerForm.static_seating,
      };
      if (createPlayerForm.trainer_id)
        payload.trainer_id = createPlayerForm.trainer_id;
      if (createPlayerForm.birth_year)
        payload.birth_year = Number(createPlayerForm.birth_year);
      const response = await fetch("http://localhost:3002/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Player created:", result);

        // Add the newly created player to the tournament
        const addToTournamentResponse = await fetch(
          `http://localhost:3002/api/tournaments/${id}/players`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              player_id: result.id,
              started_round: 1,
            }),
          }
        );

        if (addToTournamentResponse.ok) {
          console.log("Player automatically added to tournament");
          setSuccess("Player created and added to tournament successfully!");
          setError(null);
          // Clear success message after 5 seconds
          setTimeout(() => setSuccess(null), 5000);
        } else {
          console.warn("Player created but could not be added to tournament");
          setSuccess(
            "Player created successfully! You can add them to the tournament manually."
          );
          setError(null);
          // Clear success message after 5 seconds
          setTimeout(() => setSuccess(null), 5000);
        }

        setOpenCreatePlayerDialog(false);
        setCreatePlayerForm({
          name: "",
          static_seating: false,
          trainer_id: "",
          birth_year: "",
        });
        fetchPlayers(); // Refresh the players list
        fetchTournamentPlayers(); // Refresh the tournament players
        setError(null); // Clear any previous errors
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create player");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setCreatingPlayer(false);
    }
  };

  const handleTextFieldChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setCreateMatchForm({
        ...createMatchForm,
        [field]: event.target.value,
      });
    };

  const handleSelectChange =
    (field: string) => (event: SelectChangeEvent<string>) => {
      setCreateMatchForm({
        ...createMatchForm,
        [field]: event.target.value,
      });
    };

  const handleAddPlayerTextFieldChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setAddPlayerForm({
        ...addPlayerForm,
        [field]: event.target.value,
      });
    };

  const handleCreatePlayerChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement | { value: unknown }>) => {
      const value =
        field === "static_seating"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setCreatePlayerForm({
        ...createPlayerForm,
        [field]: value,
      });
    };

  // Count matches that are waiting for results to be resolved
  const getUnresolvedMatchesCount = () => {
    return matches.filter((match) => !match.result || match.result === "")
      .length;
  };

  // Add handler for ending the tournament
  const handleEndTournament = async () => {
    if (!tournament) return;
    setEndingTournament(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${tournament.id}/completion`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_completed: true }),
        }
      );
      if (response.ok) {
        setSuccess("Tournament marked as completed.");
        // Refetch tournament data to update UI
        await fetchTournamentData();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to end tournament");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setEndingTournament(false);
    }
  };

  const handleRemovePlayer = async (playerId: number) => {
    if (!tournament) return;
    if (
      !window.confirm(
        "Are you sure you want to remove this player from the tournament?"
      )
    )
      return;
    setRemovingPlayerId(playerId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${tournament.id}/players/${playerId}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        setTournamentPlayers((prev) => prev.filter((p) => p.id !== playerId));
        setSuccess("Player removed from tournament.");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to remove player.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setRemovingPlayerId(null);
    }
  };

  const handleRemoveAllPlayers = async () => {
    if (!tournament) return;
    if (
      !window.confirm(
        "Are you sure you want to remove ALL players from this tournament? This cannot be undone."
      )
    )
      return;
    setRemovingAllPlayers(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${tournament.id}/players`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        setTournamentPlayers([]);
        setSuccess("All players removed from tournament.");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to remove all players.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setRemovingAllPlayers(false);
    }
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error || !tournament) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/tournaments")}
          sx={{ mb: 2 }}
        >
          Back to Tournaments
        </Button>
        <Alert severity="error">{error || "Tournament not found"}</Alert>
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {success}
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/tournaments")}
        sx={{ mb: 2 }}
      >
        Back to Tournaments
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {/* Tournament Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" mb={2}>
          <TournamentIcon color="primary" sx={{ mr: 2, fontSize: 40 }} />
          <Box>
            <Typography variant="h4" component="h1">
              {tournament.name}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {formatDate(tournament.date)}
            </Typography>
          </Box>
          {/* End Tournament Button - only show if not completed */}
          {tournament.status !== "completed" && (
            <Button
              variant="contained"
              color="error"
              sx={{ ml: "auto" }}
              onClick={handleEndTournament}
              disabled={endingTournament}
            >
              {endingTournament ? "Ending..." : "End Tournament"}
            </Button>
          )}
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={1}>
                  <TrophyIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Status</Typography>
                </Box>
                <Chip
                  label={getStatusLabel(tournament.status)}
                  color={getStatusColor(tournament.status) as any}
                  size="medium"
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={1}>
                  <PeopleIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography variant="h6">League</Typography>
                </Box>
                <Typography variant="body1">
                  {tournament.league_name || "No League"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={1}>
                  <Typography variant="h6">Bracket Type</Typography>
                </Box>
                <Typography variant="body1">
                  {getBracketTypeLabel(tournament.bracket_type)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Created
                </Typography>
                <Typography variant="body1">
                  {formatDate(tournament.created_at)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Main Content Tabs */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
          <Tabs
            value={mainTabValue}
            onChange={(_, newValue) => setMainTabValue(newValue)}
            variant="fullWidth"
          >
            <Tab
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PeopleIcon />
                  <Typography>Players ({tournamentPlayers.length})</Typography>
                </Box>
              }
            />
            <Tab
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <TournamentIcon />
                  <Typography>
                    Matches ({matches.length})
                    {getUnresolvedMatchesCount() > 0 && (
                      <Chip
                        label={getUnresolvedMatchesCount()}
                        color="warning"
                        size="small"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Typography>
                </Box>
              }
            />
            <Tab
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LeaderboardIcon />
                  <Typography>Leaderboard</Typography>
                </Box>
              }
            />
          </Tabs>
        </Box>

        {/* Players Tab Content */}
        {mainTabValue === 0 && (
          <Box>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h5" gutterBottom>
                Tournament Players
              </Typography>
              <Box display="flex" gap={2}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setError(null); // Clear any previous errors
                    setSuccess(null); // Clear any previous success messages
                    setOpenCreatePlayerDialog(true);
                  }}
                  disabled={tournament?.status === "completed"}
                >
                  Create New Player
                </Button>
                <Button
                  variant="contained"
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    setOpenAddPlayerDialog(true);
                  }}
                  disabled={tournament?.status === "completed"}
                >
                  Add Players
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleRemoveAllPlayers}
                  disabled={
                    tournament?.status === "completed" ||
                    tournamentPlayers.length === 0 ||
                    removingAllPlayers
                  }
                >
                  {removingAllPlayers
                    ? "Removing All..."
                    : "Remove All Players"}
                </Button>
              </Box>
            </Box>

            {Boolean(tournament?.status === "completed") && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                This tournament is completed. No new players can be added.
              </Alert>
            )}

            {tournamentPlayers.length === 0 ? (
              <Alert severity="info">
                {tournament?.status === "completed"
                  ? "No players were added to this completed tournament."
                  : "No players have been added to this tournament yet. Add players to get started!"}
              </Alert>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Seating Type</TableCell>
                      <TableCell>Started Round</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Added</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tournamentPlayers.map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>{player.name}</TableCell>
                        <TableCell>
                          <Chip
                            label={
                              Boolean(player.static_seating)
                                ? "Static"
                                : "Dynamic"
                            }
                            color={
                              Boolean(player.static_seating)
                                ? "primary"
                                : "default"
                            }
                            size="small"
                          />
                        </TableCell>
                        <TableCell>Round {player.started_round}</TableCell>
                        <TableCell>
                          <Chip
                            label={
                              Boolean(player.dropped)
                                ? `Dropped (Round ${player.started_round})`
                                : "Active"
                            }
                            color={
                              Boolean(player.dropped) ? "error" : "success"
                            }
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{formatDate(player.created_at)}</TableCell>
                        <TableCell>
                          {tournament.status !== "completed" && (
                            <>
                              <Button
                                size="small"
                                color="primary"
                                startIcon={<EditIcon />}
                                onClick={() => {
                                  setEditingPlayer(player);
                                  setEditPlayerForm({
                                    id: player.id,
                                    name: player.name,
                                    static_seating: player.static_seating,
                                    trainer_id: player.trainer_id || "",
                                    birth_year: player.birth_year
                                      ? String(player.birth_year)
                                      : "",
                                    dropped: Boolean(player.dropped),
                                    started_round: player.started_round || 1,
                                  });
                                  setOpenEditPlayerDialog(true);
                                }}
                                sx={{ mr: 1 }}
                              >
                                Edit
                              </Button>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={Boolean(player.dropped)}
                                    onChange={(e) =>
                                      setDroppedConfirm({
                                        player,
                                        newDropped: e.target.checked,
                                      })
                                    }
                                    color="error"
                                  />
                                }
                                label="Dropped"
                                sx={{ mr: 1 }}
                              />
                              <Button
                                size="small"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={() => handleRemovePlayer(player.id)}
                                disabled={removingPlayerId === player.id}
                              >
                                {removingPlayerId === player.id
                                  ? "Removing..."
                                  : "Remove"}
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* Matches Tab Content */}
        {mainTabValue === 1 && (
          <Box>
            <Typography variant="h5" gutterBottom>
              Tournament Matches - {roundNumbers.length} Rounds
              {getUnresolvedMatchesCount() > 0 && (
                <Chip
                  label={`${getUnresolvedMatchesCount()} pending`}
                  color="warning"
                  size="small"
                  sx={{ ml: 2 }}
                />
              )}
            </Typography>

            {/* Round Summary */}
            {roundNumbers.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="primary">
                          {tournament?.status === "completed"
                            ? "Final Round"
                            : "Current Round"}
                        </Typography>
                        <Typography variant="h4" color="primary">
                          {tournament?.status === "completed"
                            ? Math.max(...roundNumbers)
                            : activeRound}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {tournament?.status === "completed"
                            ? "Tournament Completed"
                            : "Active Round"}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="secondary">
                          Total Rounds
                        </Typography>
                        <Typography variant="h4" color="secondary">
                          {roundNumbers.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Tournament Structure
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="info.main">
                          Total Matches
                        </Typography>
                        <Typography variant="h4" color="info.main">
                          {matches.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Across All Rounds
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            )}

            {matches.length === 0 ? (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  No matches have been created for this tournament yet.
                </Alert>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setOpenPairingOptionsDialog(true)}
                  sx={{ mb: 2 }}
                  disabled={
                    tournamentPlayers.length === 0 ||
                    tournament?.status === "completed"
                  }
                >
                  Create First Match
                </Button>
                {tournamentPlayers.length === 0 && (
                  <Alert severity="warning">
                    Add players to the tournament before creating matches.
                  </Alert>
                )}
                {Boolean(tournament?.status === "completed") && (
                  <Alert severity="warning">
                    This tournament is completed. No new matches can be created.
                  </Alert>
                )}
              </Box>
            ) : (
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Round {selectedRound} -{" "}
                    {selectedRound && matchesByRound[selectedRound]
                      ? matchesByRound[selectedRound].length
                      : 0}{" "}
                    matches
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 1,
                    }}
                  >
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => setOpenPairingOptionsDialog(true)}
                      disabled={
                        tournament?.status === "completed" ||
                        !canCreateNextRound()
                      }
                    >
                      Create Match
                    </Button>
                    {activeRound && !hasAllResultsForRound(activeRound) && (
                      <Typography variant="caption" color="text.secondary">
                        Complete all match results to create next round
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Round Navigation Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
                  <Tabs
                    value={selectedRound || activeRound}
                    onChange={(_, newValue) => setSelectedRound(newValue)}
                    variant="scrollable"
                    scrollButtons="auto"
                  >
                    {roundNumbers.map((round: number) => (
                      <Tab
                        key={round}
                        label={
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2">
                              Round {round}
                            </Typography>
                            {round === activeRound && (
                              <Chip
                                label="Active"
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        }
                        value={round}
                      />
                    ))}
                  </Tabs>
                </Box>

                {/* Round Status Controls */}
                {selectedRound && matchesByRound[selectedRound] && (
                  <Box sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <Typography variant="h6">
                        Round {selectedRound} Status
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        {roundStatuses[selectedRound] === "pending" && (
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleStartRound(selectedRound)}
                            disabled={startingRound === selectedRound}
                          >
                            {startingRound === selectedRound
                              ? "Starting..."
                              : "Start Round"}
                          </Button>
                        )}
                        {roundStatuses[selectedRound] === "started" && (
                          <Button
                            variant="contained"
                            color="success"
                            onClick={() => handleCompleteRound(selectedRound)}
                            disabled={completingRound === selectedRound}
                          >
                            {completingRound === selectedRound
                              ? "Completing..."
                              : "Complete Round"}
                          </Button>
                        )}
                        {roundStatuses[selectedRound] === "completed" && (
                          <Chip
                            label="Round Completed"
                            color="success"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    </Box>
                    {roundStatuses[selectedRound] === "pending" && (
                      <Alert severity="info">
                        Click "Start Round" to unlock result options for this
                        round.
                      </Alert>
                    )}
                    {roundStatuses[selectedRound] === "started" && (
                      <Alert severity="success">
                        Round is active. You can now enter match results.
                      </Alert>
                    )}
                    {roundStatuses[selectedRound] === "completed" && (
                      <Alert severity="warning">
                        Round is completed. Results are locked.
                      </Alert>
                    )}
                  </Box>
                )}

                {/* Matches for Selected Round */}
                {selectedRound && matchesByRound[selectedRound] && (
                  <Box>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Player 1</TableCell>
                            <TableCell>Player 2</TableCell>
                            <TableCell>Result</TableCell>
                            <TableCell>Winner</TableCell>
                            <TableCell>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {matchesByRound[selectedRound].map((match) => (
                            <TableRow
                              key={match.id}
                              sx={{
                                backgroundColor:
                                  recentlyUpdatedMatch === match.id
                                    ? "action.hover"
                                    : "inherit",
                              }}
                            >
                              <TableCell>
                                {match.player1_name || "TBD"}
                              </TableCell>
                              <TableCell>
                                {match.player2_name || "TBD"}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={getResultLabel(match.result || "")}
                                  color={
                                    getResultColor(match.result || "") as any
                                  }
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>
                                {match.winner_name || "N/A"}
                              </TableCell>
                              <TableCell>
                                <Box
                                  sx={{
                                    display: "flex",
                                    gap: 1,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {/* Edit/Delete buttons - only show when round is pending */}
                                  {roundStatuses[selectedRound] ===
                                    "pending" && (
                                    <>
                                      <Button
                                        size="small"
                                        color="primary"
                                        startIcon={<EditIcon />}
                                        onClick={() => {
                                          setEditingMatch(match);
                                          setEditMatchForm({
                                            player1_id: match.player1_id
                                              ? String(match.player1_id)
                                              : "",
                                            player2_id: match.player2_id
                                              ? String(match.player2_id)
                                              : "",
                                          });
                                          setOpenEditMatchDialog(true);
                                        }}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="small"
                                        color="error"
                                        startIcon={<DeleteIcon />}
                                        onClick={() =>
                                          handleDeleteMatch(match.id)
                                        }
                                        disabled={deletingMatchId === match.id}
                                      >
                                        {deletingMatchId === match.id
                                          ? "Deleting..."
                                          : "Delete"}
                                      </Button>
                                    </>
                                  )}

                                  {/* Result buttons - only show when round is started and no result exists */}
                                  {roundStatuses[selectedRound] === "started" &&
                                    !match.result && (
                                      <>
                                        <Button
                                          variant="outlined"
                                          size="small"
                                          color="primary"
                                          disabled={
                                            updatingMatchResult === match.id
                                          }
                                          onClick={() =>
                                            handleUpdateMatchResult(
                                              match.id,
                                              "WIN_P1"
                                            )
                                          }
                                          sx={{ minWidth: "auto", px: 1 }}
                                        >
                                          {match.player1_name || "Player 1"}{" "}
                                          Wins
                                        </Button>
                                        <Button
                                          variant="outlined"
                                          size="small"
                                          color="warning"
                                          disabled={
                                            updatingMatchResult === match.id
                                          }
                                          onClick={() =>
                                            handleUpdateMatchResult(
                                              match.id,
                                              "DRAW"
                                            )
                                          }
                                          sx={{ minWidth: "auto", px: 1 }}
                                        >
                                          Tie
                                        </Button>
                                        <Button
                                          variant="outlined"
                                          size="small"
                                          color="secondary"
                                          disabled={
                                            updatingMatchResult === match.id
                                          }
                                          onClick={() =>
                                            handleUpdateMatchResult(
                                              match.id,
                                              "WIN_P2"
                                            )
                                          }
                                          sx={{ minWidth: "auto", px: 1 }}
                                        >
                                          {match.player2_name || "Player 2"}{" "}
                                          Wins
                                        </Button>
                                      </>
                                    )}

                                  {/* Show result status when result exists or round is completed */}
                                  {(match.result ||
                                    roundStatuses[selectedRound] ===
                                      "completed") && (
                                    <Chip
                                      label={
                                        match.result
                                          ? "Result Set"
                                          : "Round Completed"
                                      }
                                      color={
                                        match.result ? "success" : "warning"
                                      }
                                      size="small"
                                    />
                                  )}
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* Leaderboard Tab Content */}
        {mainTabValue === 2 && (
          <Box>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h5" gutterBottom>
                Tournament Leaderboard
              </Typography>
              <Button
                variant="outlined"
                onClick={fetchLeaderboard}
                disabled={loading}
              >
                Refresh Leaderboard
              </Button>
            </Box>

            {leaderboard.length === 0 ? (
              <Alert severity="info">
                No leaderboard data available. Complete some matches to see
                standings.
              </Alert>
            ) : (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Tiebreakers:</strong> Opponent's Resistance and
                    Opponent's Opponent's Resistance are calculated based on
                    your opponents' performance. Higher resistance values
                    indicate stronger opponents, which can help break ties in
                    standings.
                  </Typography>
                </Alert>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Rank</TableCell>
                        <TableCell>Player</TableCell>
                        <TableCell align="center">Points</TableCell>
                        <TableCell align="center">W-L-D</TableCell>
                        <TableCell align="center">Matches</TableCell>
                        <TableCell align="center">
                          Opponent's Resistance
                        </TableCell>
                        <TableCell align="center">
                          Opponent's Opponent's Resistance
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {leaderboard.map((entry, index) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              <Typography
                                variant="h6"
                                color="primary"
                                fontWeight="bold"
                              >
                                {index + 1}
                              </Typography>
                              {index === 0 && (
                                <Chip
                                  label="🥇"
                                  size="small"
                                  sx={{ ml: 1 }}
                                  color="warning"
                                />
                              )}
                              {index === 1 && (
                                <Chip
                                  label="🥈"
                                  size="small"
                                  sx={{ ml: 1 }}
                                  color="default"
                                />
                              )}
                              {index === 2 && (
                                <Chip
                                  label="🥉"
                                  size="small"
                                  sx={{ ml: 1 }}
                                  color="default"
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body1" fontWeight="medium">
                              {entry.name}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography
                              variant="h6"
                              color="primary"
                              fontWeight="bold"
                            >
                              {entry.points}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2">
                              {entry.wins}-{entry.losses}-{entry.draws}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2">
                              {entry.matches_played}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2">
                              {(entry.opponent_resistance * 100).toFixed(1)}%
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2">
                              {(
                                entry.opponent_opponent_resistance * 100
                              ).toFixed(1)}
                              %
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Box>
        )}
      </Paper>

      {/* Add Player Dialog */}
      <Dialog
        open={openAddPlayerDialog && tournament?.status !== "completed"}
        onClose={() => {
          setOpenAddPlayerDialog(false);
          setAddPlayerFormError(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add Players to Tournament</DialogTitle>
        <form onSubmit={handleAddPlayer}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Autocomplete
                  multiple
                  disableCloseOnSelect
                  options={players.filter(
                    (player) =>
                      !tournamentPlayers.some((tp) => tp.id === player.id)
                  )}
                  getOptionLabel={(option) => option.name}
                  value={addPlayerForm.selectedPlayers}
                  onChange={(_, newValue) => {
                    setAddPlayerForm({
                      ...addPlayerForm,
                      selectedPlayers: newValue,
                    });
                    // Clear error when user selects players
                    if (newValue.length > 0) {
                      setAddPlayerFormError(null);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Players"
                      placeholder="Choose players to add"
                      error={Boolean(addPlayerFormError)}
                      helperText={addPlayerFormError}
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props}>
                      <Box display="flex" alignItems="center" width="100%">
                        <Typography variant="body1">{option.name}</Typography>
                        {Boolean(option.static_seating) && (
                          <Chip
                            label="Static"
                            size="small"
                            color="secondary"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>
                    </li>
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Started Round"
                  type="number"
                  value={addPlayerForm.started_round}
                  onChange={handleAddPlayerTextFieldChange("started_round")}
                  inputProps={{ min: 1 }}
                  required
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setOpenAddPlayerDialog(false);
                setAddPlayerFormError(null);
              }}
              disabled={addingPlayer}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                addingPlayer || addPlayerForm.selectedPlayers.length === 0
              }
            >
              {addingPlayer
                ? "Adding..."
                : `Add ${addPlayerForm.selectedPlayers.length} Player${
                    addPlayerForm.selectedPlayers.length !== 1 ? "s" : ""
                  }`}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Pairing Options Dialog */}
      <Dialog
        open={openPairingOptionsDialog}
        onClose={() => setOpenPairingOptionsDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Matches</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Choose how you would like to create matches for this round:
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                onClick={() => handlePairingOptionSelect("automatic")}
                disabled={creatingPairings}
                sx={{
                  py: 2,
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <Typography variant="h6" sx={{ mb: 1 }}>
                  🎯 Automatic Pairing
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Automatically pair players based on points and seating
                  constraints. Static seating players will not be paired
                  together.
                </Typography>
              </Button>
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                fullWidth
                size="large"
                onClick={() => handlePairingOptionSelect("custom")}
                disabled={creatingPairings}
                sx={{
                  py: 2,
                  textAlign: "left",
                  justifyContent: "flex-start",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <Typography variant="h6" sx={{ mb: 1 }}>
                  ✏️ Custom Pairing
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Manually select players for each match. You have full control
                  over the pairings.
                </Typography>
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenPairingOptionsDialog(false)}
            disabled={creatingPairings}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Player Dialog */}
      <Dialog
        open={openCreatePlayerDialog}
        onClose={() => setOpenCreatePlayerDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Player</DialogTitle>
        <form onSubmit={handleCreatePlayer}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Player Name"
                  value={createPlayerForm.name}
                  onChange={handleCreatePlayerChange("name")}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={createPlayerForm.static_seating}
                      onChange={handleCreatePlayerChange("static_seating")}
                    />
                  }
                  label="Static Seating (cannot be paired with other static seating players)"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Trainer ID (optional)"
                  value={createPlayerForm.trainer_id}
                  onChange={handleCreatePlayerChange("trainer_id")}
                  fullWidth
                  margin="normal"
                />
                <TextField
                  label="Birth Year (optional)"
                  value={createPlayerForm.birth_year}
                  onChange={handleCreatePlayerChange("birth_year")}
                  type="number"
                  fullWidth
                  margin="normal"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setOpenCreatePlayerDialog(false)}
              disabled={creatingPlayer}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={creatingPlayer || !createPlayerForm.name.trim()}
            >
              {creatingPlayer ? "Creating..." : "Create Player"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Create Match Dialog */}
      <Dialog
        open={openCreateMatchDialog && tournament?.status !== "completed"}
        onClose={() => setOpenCreateMatchDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Match</DialogTitle>
        <form onSubmit={handleCreateMatch}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Round Number"
                  type="number"
                  value={createMatchForm.round_number}
                  onChange={handleTextFieldChange("round_number")}
                  inputProps={{ min: 1 }}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Player 1 (Optional)</InputLabel>
                  <Select
                    value={createMatchForm.player1_id}
                    label="Player 1 (Optional)"
                    onChange={handleSelectChange("player1_id")}
                  >
                    <MenuItem value="">
                      <em>Select Player 1</em>
                    </MenuItem>
                    {tournamentPlayers
                      .filter((player) => !Boolean(player.dropped))
                      .map((player) => (
                        <MenuItem key={player.id} value={player.id}>
                          {player.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Player 2 (Optional)</InputLabel>
                  <Select
                    value={createMatchForm.player2_id}
                    label="Player 2 (Optional)"
                    onChange={handleSelectChange("player2_id")}
                  >
                    <MenuItem value="">
                      <em>Select Player 2</em>
                    </MenuItem>
                    {tournamentPlayers
                      .filter((player) => !Boolean(player.dropped))
                      .map((player) => (
                        <MenuItem key={player.id} value={player.id}>
                          {player.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setOpenCreateMatchDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Creating..." : "Create Match"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Player Dialog */}
      <Dialog
        open={openEditPlayerDialog}
        onClose={() => setOpenEditPlayerDialog(false)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editPlayerForm.id) return;
            setEditing(true);
            setError(null);
            setSuccess(null);
            try {
              // Update global player info
              const payload: any = {
                name: editPlayerForm.name,
                static_seating: editPlayerForm.static_seating,
                trainer_id: editPlayerForm.trainer_id,
                birth_year: editPlayerForm.birth_year
                  ? Number(editPlayerForm.birth_year)
                  : null,
              };
              const playerRes = await fetch(
                `http://localhost:3002/api/players/${editPlayerForm.id}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }
              );
              if (!playerRes.ok) {
                const errorData = await playerRes.json();
                setError(errorData.error || "Failed to update player");
                setEditing(false);
                return;
              }
              // Update dropped status
              const dropRes = await fetch(
                `http://localhost:3002/api/tournaments/${tournament.id}/players/${editPlayerForm.id}/drop`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ dropped: editPlayerForm.dropped }),
                }
              );
              if (!dropRes.ok) {
                const errorData = await dropRes.json();
                setError(errorData.error || "Failed to update dropped status");
                setEditing(false);
                return;
              }
              // Update started_round
              const roundRes = await fetch(
                `http://localhost:3002/api/tournaments/${tournament.id}/players/${editPlayerForm.id}/started_round`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    started_round: editPlayerForm.started_round,
                  }),
                }
              );
              if (!roundRes.ok) {
                const errorData = await roundRes.json();
                setError(errorData.error || "Failed to update started round");
                setEditing(false);
                return;
              }
              setSuccess("Player updated successfully!");
              setOpenEditPlayerDialog(false);
              setEditingPlayer(null);
              setEditPlayerForm({
                id: null,
                name: "",
                static_seating: false,
                trainer_id: "",
                birth_year: "",
                dropped: false,
                started_round: 1,
              });
              fetchPlayers();
              fetchTournamentPlayers();
            } catch (err) {
              setError("Network error. Please try again.");
            } finally {
              setEditing(false);
            }
          }}
        >
          <DialogTitle>Edit Player</DialogTitle>
          <DialogContent>
            <TextField
              label="Name"
              value={editPlayerForm.name}
              onChange={(e) =>
                setEditPlayerForm((f) => ({ ...f, name: e.target.value }))
              }
              fullWidth
              margin="normal"
              required
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={editPlayerForm.static_seating}
                  onChange={(e) =>
                    setEditPlayerForm((f) => ({
                      ...f,
                      static_seating: e.target.checked,
                    }))
                  }
                />
              }
              label="Static Seating"
            />
            <TextField
              label="Trainer ID"
              value={editPlayerForm.trainer_id}
              onChange={(e) =>
                setEditPlayerForm((f) => ({ ...f, trainer_id: e.target.value }))
              }
              fullWidth
              margin="normal"
            />
            <TextField
              label="Birth Year"
              type="number"
              value={editPlayerForm.birth_year}
              onChange={(e) =>
                setEditPlayerForm((f) => ({ ...f, birth_year: e.target.value }))
              }
              fullWidth
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setOpenEditPlayerDialog(false)}
              disabled={editing}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={editing}
            >
              {editing ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dropped Confirmation Dialog */}
      <Dialog
        open={!!droppedConfirm.player}
        onClose={() => setDroppedConfirm({ player: null, newDropped: false })}
      >
        <DialogTitle>
          Confirm {droppedConfirm.newDropped ? "Drop" : "Reinstate"} Player
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to{" "}
            {droppedConfirm.newDropped ? "mark" : "unmark"}{" "}
            <b>{droppedConfirm.player?.name}</b> as{" "}
            {droppedConfirm.newDropped ? "dropped" : "active"} for this
            tournament?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setDroppedConfirm({ player: null, newDropped: false })
            }
            disabled={droppedLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!droppedConfirm.player) return;
              setDroppedLoading(true);
              setError(null);
              setSuccess(null);
              try {
                const dropRes = await fetch(
                  `http://localhost:3002/api/tournaments/${tournament.id}/players/${droppedConfirm.player.id}/drop`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      dropped: droppedConfirm.newDropped,
                    }),
                  }
                );
                if (!dropRes.ok) {
                  const errorData = await dropRes.json();
                  setError(
                    errorData.error || "Failed to update dropped status"
                  );
                  setDroppedLoading(false);
                  return;
                }
                setSuccess("Player drop status updated");
                fetchTournamentPlayers();
              } catch (err) {
                setError("Network error. Please try again.");
              } finally {
                setDroppedLoading(false);
                setDroppedConfirm({ player: null, newDropped: false });
              }
            }}
            color={droppedConfirm.newDropped ? "error" : "primary"}
            variant="contained"
            disabled={droppedLoading}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Match Dialog */}
      <Dialog
        open={openEditMatchDialog}
        onClose={() => setOpenEditMatchDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Match</DialogTitle>
        <form onSubmit={handleEditMatch}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Player 1 (Optional)</InputLabel>
                  <Select
                    value={editMatchForm.player1_id}
                    label="Player 1 (Optional)"
                    onChange={(e) =>
                      setEditMatchForm({
                        ...editMatchForm,
                        player1_id: e.target.value,
                      })
                    }
                  >
                    <MenuItem value="">
                      <em>Select Player 1</em>
                    </MenuItem>
                    {tournamentPlayers
                      .filter((player) => !Boolean(player.dropped))
                      .map((player) => (
                        <MenuItem key={player.id} value={player.id}>
                          {player.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Player 2 (Optional)</InputLabel>
                  <Select
                    value={editMatchForm.player2_id}
                    label="Player 2 (Optional)"
                    onChange={(e) =>
                      setEditMatchForm({
                        ...editMatchForm,
                        player2_id: e.target.value,
                      })
                    }
                  >
                    <MenuItem value="">
                      <em>Select Player 2</em>
                    </MenuItem>
                    {tournamentPlayers
                      .filter((player) => !Boolean(player.dropped))
                      .map((player) => (
                        <MenuItem key={player.id} value={player.id}>
                          {player.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setOpenEditMatchDialog(false)}
              disabled={editingMatchLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={editingMatchLoading}
            >
              {editingMatchLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default TournamentView;
