import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PersonIcon from "@mui/icons-material/Person";
import PushPinIcon from "@mui/icons-material/PushPin";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { MatchReportRow, MatchWithPlayers } from "../../types/match";
import { MATCH_STATUS, resolveEffectiveResult } from "../../types/match";

interface PlayerStanding {
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
}

interface StaticSeatInfo {
  hasStaticSeating: boolean;
  seatNumber: number | null;
}

interface Props {
  matches: MatchWithPlayers[];
  pendingResults: Map<string, { winnerId: string | null; result: string }>;
  matchReports: Map<string, MatchReportRow>;
  matchNumberById: Map<string, number>;
  standingsByPlayerId: Map<string, PlayerStanding>;
  playerStaticSeatMap: Map<string, StaticSeatInfo>;
  editingPairings: boolean;
  editedPairings: Map<string, { player1Id: string | null; player2Id: string | null }>;
  roundPlayers: { id: string; name: string }[];
  availablePool: Map<string, string>;
  updatingMatch: boolean;
  sortBy: "match" | "status" | "record";
  sortOrder: "asc" | "desc";
  handleSort: (col: "match" | "status" | "record") => void;
  handleQuickResult: (match: MatchWithPlayers, winner: "player1" | "player2" | "draw") => void;
  removeFromSlot: (matchId: string, slot: "player1" | "player2") => void;
  assignToSlot: (matchId: string, slot: "player1" | "player2", playerId: string) => void;
}

export default function MatchTableDesktop({
  matches,
  pendingResults,
  matchReports,
  matchNumberById,
  standingsByPlayerId,
  playerStaticSeatMap,
  editingPairings,
  editedPairings,
  roundPlayers,
  availablePool,
  updatingMatch,
  sortBy,
  sortOrder,
  handleSort,
  handleQuickResult,
  removeFromSlot,
  assignToSlot,
}: Props) {
  return (
    <TableContainer sx={{ overflowX: "auto", display: { xs: "none", sm: "block" } }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sortDirection={sortBy === "match" ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === "match"}
                direction={sortBy === "match" ? sortOrder : "asc"}
                onClick={() => handleSort("match")}
              >
                Match #
              </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortBy === "record" ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === "record"}
                direction={sortBy === "record" ? sortOrder : "desc"}
                onClick={() => handleSort("record")}
              >
                Player 1
              </TableSortLabel>
            </TableCell>
            <TableCell>Player 2</TableCell>
            <TableCell sortDirection={sortBy === "status" ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === "status"}
                direction={sortBy === "status" ? sortOrder : "asc"}
                onClick={() => handleSort("status")}
              >
                Status
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {matches.map((match) => {
            const canEdit = match.status === "pending" && match.player2_id !== null;
            const matchNumber = matchNumberById.get(match.id) ?? 0;
            const pendingResult = pendingResults.get(match.id);
            const report = matchReports.get(match.id);
            const { effectiveWinnerId, effectiveResult } = resolveEffectiveResult(
              match,
              pendingResult,
              report,
            );

            const isEditableRow =
              editingPairings &&
              (match.status === MATCH_STATUS.READY || match.status === MATCH_STATUS.BYE);

            const p1Seat = playerStaticSeatMap.get(match.player1_id);
            const p2Seat = match.player2_id
              ? playerStaticSeatMap.get(match.player2_id)
              : undefined;
            const hasStaticSeating = p1Seat?.hasStaticSeating || p2Seat?.hasStaticSeating;

            const getStandingLabel = (pid: string) => {
              const s = standingsByPlayerId.get(pid);
              const wins = s?.wins ?? 0;
              const losses = s?.losses ?? 0;
              const draws = s?.draws ?? 0;
              const pts = s?.matchPoints ?? 0;
              return `${wins}-${losses}-${draws} • ${pts} pts`;
            };

            const renderEditCell = (slot: "player1" | "player2") => {
              const ep = editedPairings.get(match.id);
              const playerId = slot === "player1" ? (ep?.player1Id ?? null) : (ep?.player2Id ?? null);
              const playerName = playerId
                ? (roundPlayers.find((p) => p.id === playerId)?.name ?? "Unknown")
                : null;
              return playerId ? (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <Typography variant="body2">{playerName}</Typography>
                  <IconButton size="small" onClick={() => removeFromSlot(match.id, slot)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ) : (
                <Select
                  size="small"
                  displayEmpty
                  value=""
                  onChange={(e) => assignToSlot(match.id, slot, e.target.value)}
                  renderValue={() => (
                    <em>
                      {slot === "player2" && !match.player2_id
                        ? "Bye — assign to pair"
                        : "Select player…"}
                    </em>
                  )}
                  sx={{ minWidth: slot === "player2" ? 160 : 140 }}
                >
                  {[...availablePool.entries()].map(([id, name]) => (
                    <MenuItem key={id} value={id}>
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              );
            };

            return (
              <TableRow key={match.id}>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {matchNumber}
                    {hasStaticSeating && (
                      <Tooltip title="Static seating">
                        <PushPinIcon
                          sx={{ fontSize: 13, color: "text.secondary", opacity: 0.7 }}
                        />
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>

                {/* Player 1 cell */}
                <TableCell
                  sx={{
                    backgroundColor: isEditableRow ? "transparent" : (() => {
                      if (match.status === "bye" || !match.player2_id) return "rgba(33, 150, 243, 0.1)";
                      if (effectiveResult === "Draw") return "rgba(255, 152, 0, 0.1)";
                      if (effectiveWinnerId === match.player1_id) return "rgba(76, 175, 80, 0.1)";
                      if (effectiveWinnerId === match.player2_id) return "rgba(244, 67, 54, 0.1)";
                      return "transparent";
                    })(),
                  }}
                >
                  {isEditableRow ? (
                    renderEditCell("player1")
                  ) : (
                    <Box display="flex" flexDirection="column" gap={0.5}>
                      <Box>
                        <Typography variant="body2">{match.player1_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {getStandingLabel(match.player1_id)}
                        </Typography>
                      </Box>
                      {match.player2_id && (
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          <Chip
                            label="1-0"
                            size="small"
                            variant={effectiveWinnerId === match.player1_id ? "filled" : "outlined"}
                            sx={{
                              borderColor: "success.main",
                              color: effectiveWinnerId === match.player1_id ? "white" : "success.main",
                              backgroundColor:
                                effectiveWinnerId === match.player1_id ? "success.main" : "transparent",
                              cursor: canEdit ? "pointer" : "default",
                              opacity: canEdit ? 1 : 0.7,
                              "&:hover": canEdit
                                ? {
                                    backgroundColor:
                                      effectiveWinnerId === match.player1_id
                                        ? "success.dark"
                                        : "success.light",
                                    color: "white",
                                  }
                                : {},
                            }}
                            onClick={() => handleQuickResult(match, "player1")}
                            disabled={!canEdit || updatingMatch}
                          />
                          <Chip
                            label="Draw"
                            size="small"
                            variant={effectiveResult === "Draw" ? "filled" : "outlined"}
                            sx={{
                              borderColor: "warning.main",
                              color: effectiveResult === "Draw" ? "white" : "warning.main",
                              backgroundColor:
                                effectiveResult === "Draw" ? "warning.main" : "transparent",
                              cursor: canEdit ? "pointer" : "default",
                              opacity: canEdit ? 1 : 0.7,
                              "&:hover": canEdit
                                ? {
                                    backgroundColor:
                                      effectiveResult === "Draw" ? "warning.dark" : "warning.light",
                                    color: "white",
                                  }
                                : {},
                            }}
                            onClick={() => handleQuickResult(match, "draw")}
                            disabled={!canEdit || updatingMatch}
                          />
                          <Chip
                            label="0-1"
                            size="small"
                            variant={effectiveWinnerId === match.player2_id ? "filled" : "outlined"}
                            sx={{
                              borderColor: "error.main",
                              color: effectiveWinnerId === match.player2_id ? "white" : "error.main",
                              backgroundColor:
                                effectiveWinnerId === match.player2_id ? "error.main" : "transparent",
                              cursor: canEdit ? "pointer" : "default",
                              opacity: canEdit ? 1 : 0.7,
                              "&:hover": canEdit
                                ? {
                                    backgroundColor:
                                      effectiveWinnerId === match.player2_id
                                        ? "error.dark"
                                        : "error.light",
                                    color: "white",
                                  }
                                : {},
                            }}
                            onClick={() => handleQuickResult(match, "player2")}
                            disabled={!canEdit || updatingMatch}
                          />
                        </Box>
                      )}
                    </Box>
                  )}
                </TableCell>

                {/* Player 2 cell */}
                <TableCell
                  sx={{
                    backgroundColor: isEditableRow ? "transparent" : (() => {
                      if (match.status === "bye" || !match.player2_id) return "rgba(33, 150, 243, 0.1)";
                      if (effectiveResult === "Draw") return "rgba(255, 152, 0, 0.1)";
                      if (effectiveWinnerId === match.player2_id) return "rgba(76, 175, 80, 0.1)";
                      if (effectiveWinnerId === match.player1_id) return "rgba(244, 67, 54, 0.1)";
                      return "transparent";
                    })(),
                  }}
                >
                  {isEditableRow ? (
                    renderEditCell("player2")
                  ) : match.player2_name ? (
                    <Box display="flex" flexDirection="column" gap={0.5}>
                      <Box>
                        <Typography variant="body2">{match.player2_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {match.player2_id ? getStandingLabel(match.player2_id) : ""}
                        </Typography>
                      </Box>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {/* P2 perspective: "1-0" = P2 wins, "0-1" = P1 wins */}
                        <Chip
                          label="1-0"
                          size="small"
                          variant={effectiveWinnerId === match.player2_id ? "filled" : "outlined"}
                          sx={{
                            borderColor: "success.main",
                            color: effectiveWinnerId === match.player2_id ? "white" : "success.main",
                            backgroundColor:
                              effectiveWinnerId === match.player2_id ? "success.main" : "transparent",
                            cursor: canEdit ? "pointer" : "default",
                            opacity: canEdit ? 1 : 0.7,
                            "&:hover": canEdit
                              ? {
                                  backgroundColor:
                                    effectiveWinnerId === match.player2_id
                                      ? "success.dark"
                                      : "success.light",
                                  color: "white",
                                }
                              : {},
                          }}
                          onClick={() => handleQuickResult(match, "player2")}
                          disabled={!canEdit || updatingMatch}
                        />
                        <Chip
                          label="Draw"
                          size="small"
                          variant={effectiveResult === "Draw" ? "filled" : "outlined"}
                          sx={{
                            borderColor: "warning.main",
                            color: effectiveResult === "Draw" ? "white" : "warning.main",
                            backgroundColor:
                              effectiveResult === "Draw" ? "warning.main" : "transparent",
                            cursor: canEdit ? "pointer" : "default",
                            opacity: canEdit ? 1 : 0.7,
                            "&:hover": canEdit
                              ? {
                                  backgroundColor:
                                    effectiveResult === "Draw" ? "warning.dark" : "warning.light",
                                  color: "white",
                                }
                              : {},
                          }}
                          onClick={() => handleQuickResult(match, "draw")}
                          disabled={!canEdit || updatingMatch}
                        />
                        <Chip
                          label="0-1"
                          size="small"
                          variant={effectiveWinnerId === match.player1_id ? "filled" : "outlined"}
                          sx={{
                            borderColor: "error.main",
                            color: effectiveWinnerId === match.player1_id ? "white" : "error.main",
                            backgroundColor:
                              effectiveWinnerId === match.player1_id ? "error.main" : "transparent",
                            cursor: canEdit ? "pointer" : "default",
                            opacity: canEdit ? 1 : 0.7,
                            "&:hover": canEdit
                              ? {
                                  backgroundColor:
                                    effectiveWinnerId === match.player1_id
                                      ? "error.dark"
                                      : "error.light",
                                  color: "white",
                                }
                              : {},
                          }}
                          onClick={() => handleQuickResult(match, "player1")}
                          disabled={!canEdit || updatingMatch}
                        />
                      </Box>
                    </Box>
                  ) : (
                    <Chip label="Bye" size="small" color="info" variant="outlined" />
                  )}
                </TableCell>

                {/* Status cell */}
                <TableCell>
                  <Box display="flex" flexDirection="column" gap={0.5} alignItems="flex-start">
                    <Chip
                      label={
                        match.status === "bye"
                          ? "Bye"
                          : match.status === "completed"
                            ? "Completed"
                            : match.status === "pending"
                              ? "Pending"
                              : "Ready"
                      }
                      size="small"
                      color={
                        match.status === "bye"
                          ? "info"
                          : match.status === "completed"
                            ? "success"
                            : match.status === "pending"
                              ? "warning"
                              : "default"
                      }
                    />
                    {matchReports.has(match.id) &&
                      (() => {
                        const r = matchReports.get(match.id)!;
                        if (r.conflict_status === "conflict") {
                          const p1out = r.player1_report ?? "?";
                          const p2out = r.player2_report ?? "?";
                          return (
                            <Chip
                              icon={<WarningAmberIcon />}
                              label={`Conflict: ${r.player1_name} ${p1out} / ${r.player2_name ?? "P2"} ${p2out}`}
                              color="error"
                              size="small"
                              sx={{ fontSize: "0.65rem", height: 22 }}
                            />
                          );
                        }
                        return (
                          <Chip
                            icon={<PersonIcon />}
                            label="Player reported"
                            color="info"
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: "0.65rem", height: 22 }}
                          />
                        );
                      })()}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
