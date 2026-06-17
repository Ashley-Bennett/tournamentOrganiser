import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Select,
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
  handleQuickResult: (match: MatchWithPlayers, winner: "player1" | "player2" | "draw") => void;
  removeFromSlot: (matchId: string, slot: "player1" | "player2") => void;
  assignToSlot: (matchId: string, slot: "player1" | "player2", playerId: string) => void;
}

export default function MatchCardMobile({
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
  handleQuickResult,
  removeFromSlot,
  assignToSlot,
}: Props) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {matches.map((match) => {
        const canEditCard = match.status === "pending" && match.player2_id !== null;
        const matchNum = matchNumberById.get(match.id) ?? 0;
        const pendingResult = pendingResults.get(match.id);
        const report = matchReports.get(match.id);
        const { effectiveWinnerId: effWinnerId, effectiveResult: effResult } =
          resolveEffectiveResult(match, pendingResult, report);

        const isByeCard = match.status === "bye" || !match.player2_id;
        const p1Wins = effWinnerId === match.player1_id;
        const p2Wins = effWinnerId === match.player2_id;
        const isDrawCard = effResult === "Draw";

        const cardP1Bg = isByeCard
          ? "rgba(33,150,243,0.1)"
          : isDrawCard
            ? "rgba(255,152,0,0.1)"
            : p1Wins
              ? "rgba(76,175,80,0.1)"
              : p2Wins
                ? "rgba(244,67,54,0.1)"
                : "transparent";
        const cardP2Bg = isByeCard
          ? "rgba(33,150,243,0.1)"
          : isDrawCard
            ? "rgba(255,152,0,0.1)"
            : p2Wins
              ? "rgba(76,175,80,0.1)"
              : p1Wins
                ? "rgba(244,67,54,0.1)"
                : "transparent";

        const p1Seat = playerStaticSeatMap.get(match.player1_id);
        const p2Seat = match.player2_id
          ? playerStaticSeatMap.get(match.player2_id)
          : undefined;
        const hasStaticSeat = p1Seat?.hasStaticSeating || p2Seat?.hasStaticSeating;

        const getRecord = (pid: string) => {
          const s = standingsByPlayerId.get(pid);
          return `${s?.wins ?? 0}-${s?.losses ?? 0}-${s?.draws ?? 0} · ${s?.matchPoints ?? 0}pts`;
        };

        const isEditableMatch =
          editingPairings &&
          (match.status === MATCH_STATUS.READY || match.status === MATCH_STATUS.BYE);
        const ep = editedPairings.get(match.id);
        const p1EditId = ep?.player1Id ?? null;
        const p2EditId = ep?.player2Id ?? null;
        const p1EditName = p1EditId
          ? (roundPlayers.find((p) => p.id === p1EditId)?.name ?? "Unknown")
          : null;
        const p2EditName = p2EditId
          ? (roundPlayers.find((p) => p.id === p2EditId)?.name ?? "Unknown")
          : null;

        return (
          <Box
            key={match.id}
            sx={{ borderBottom: "1px solid", borderColor: "divider", py: 1.5, px: 1 }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Box display="flex" alignItems="center" gap={0.5}>
                <Typography variant="caption" color="text.secondary" fontWeight="medium">
                  Match {matchNum}
                </Typography>
                {hasStaticSeat && (
                  <Tooltip title="Static seating">
                    <PushPinIcon sx={{ fontSize: 12, color: "text.secondary", opacity: 0.7 }} />
                  </Tooltip>
                )}
              </Box>
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
            </Box>
            <Box
              display="flex"
              gap={1}
              mb={canEditCard && !isByeCard && !editingPairings ? 1 : 0}
            >
              {/* Player 1 */}
              <Box
                sx={{
                  flex: 1,
                  p: 0.75,
                  borderRadius: 1,
                  backgroundColor: isEditableMatch ? "transparent" : cardP1Bg,
                  minWidth: 0,
                }}
              >
                {isEditableMatch ? (
                  p1EditId ? (
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                        {p1EditName}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => removeFromSlot(match.id, "player1")}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <Select
                      size="small"
                      displayEmpty
                      value=""
                      onChange={(e) => assignToSlot(match.id, "player1", e.target.value)}
                      renderValue={() => <em>Select player…</em>}
                      sx={{ width: "100%" }}
                    >
                      {[...availablePool.entries()].map(([id, name]) => (
                        <MenuItem key={id} value={id}>
                          {name}
                        </MenuItem>
                      ))}
                    </Select>
                  )
                ) : (
                  <>
                    <Typography variant="body2" fontWeight="medium" noWrap>
                      {match.player1_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getRecord(match.player1_id)}
                    </Typography>
                  </>
                )}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  vs
                </Typography>
              </Box>
              {/* Player 2 */}
              <Box
                sx={{
                  flex: 1,
                  p: 0.75,
                  borderRadius: 1,
                  backgroundColor: isEditableMatch ? "transparent" : cardP2Bg,
                  minWidth: 0,
                }}
              >
                {isEditableMatch ? (
                  p2EditId ? (
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                        {p2EditName}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => removeFromSlot(match.id, "player2")}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <Select
                      size="small"
                      displayEmpty
                      value=""
                      onChange={(e) => assignToSlot(match.id, "player2", e.target.value)}
                      renderValue={() => <em>Select player…</em>}
                      sx={{ width: "100%" }}
                    >
                      {[...availablePool.entries()].map(([id, name]) => (
                        <MenuItem key={id} value={id}>
                          {name}
                        </MenuItem>
                      ))}
                    </Select>
                  )
                ) : match.player2_name ? (
                  <>
                    <Typography variant="body2" fontWeight="medium" noWrap>
                      {match.player2_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {match.player2_id ? getRecord(match.player2_id) : ""}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="info.main" fontStyle="italic">
                    BYE
                  </Typography>
                )}
              </Box>
            </Box>
            {/* Quick result chips */}
            {canEditCard && match.player2_id && !editingPairings && (
              <Box display="flex" gap={0.5}>
                <Chip
                  label="1-0"
                  size="small"
                  variant={p1Wins ? "filled" : "outlined"}
                  sx={{
                    flex: 1,
                    borderColor: "success.main",
                    color: p1Wins ? "white" : "success.main",
                    backgroundColor: p1Wins ? "success.main" : "transparent",
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: p1Wins ? "success.dark" : "success.light",
                      color: "white",
                    },
                  }}
                  onClick={() => handleQuickResult(match, "player1")}
                  disabled={!!updatingMatch}
                />
                <Chip
                  label="Draw"
                  size="small"
                  variant={isDrawCard ? "filled" : "outlined"}
                  sx={{
                    flex: 1,
                    borderColor: "warning.main",
                    color: isDrawCard ? "white" : "warning.main",
                    backgroundColor: isDrawCard ? "warning.main" : "transparent",
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: isDrawCard ? "warning.dark" : "warning.light",
                      color: "white",
                    },
                  }}
                  onClick={() => handleQuickResult(match, "draw")}
                  disabled={!!updatingMatch}
                />
                <Chip
                  label="0-1"
                  size="small"
                  variant={p2Wins ? "filled" : "outlined"}
                  sx={{
                    flex: 1,
                    borderColor: "error.main",
                    color: p2Wins ? "white" : "error.main",
                    backgroundColor: p2Wins ? "error.main" : "transparent",
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: p2Wins ? "error.dark" : "error.light",
                      color: "white",
                    },
                  }}
                  onClick={() => handleQuickResult(match, "player2")}
                  disabled={!!updatingMatch}
                />
              </Box>
            )}
            {/* Player-submitted result indicator */}
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
                      sx={{ alignSelf: "flex-start" }}
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
                    sx={{ alignSelf: "flex-start" }}
                  />
                );
              })()}
          </Box>
        );
      })}
    </Box>
  );
}
