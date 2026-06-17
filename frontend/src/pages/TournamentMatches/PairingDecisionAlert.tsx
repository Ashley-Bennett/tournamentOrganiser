import { Alert, Box, Typography } from "@mui/material";
import type { PairingDecisionLog } from "../../utils/tournamentPairing";
import { humanizeByeReason, humanizeFloatReason } from "../../types/match";

interface Props {
  decisionLog: PairingDecisionLog | null | undefined;
  selectedRound: number | "standings";
}

export default function PairingDecisionAlert({ decisionLog, selectedRound }: Props) {
  if (!decisionLog) return null;

  const visibleFloats = (decisionLog.floatDetails ?? []).filter(
    (d) =>
      !d.reason.startsWith("DISSOLVE:") &&
      !d.reason.includes("bye (last bracket"),
  );

  return (
    <Alert severity="info" sx={{ mb: 2 }} icon={false}>
      <Typography variant="subtitle2" gutterBottom fontWeight={600}>
        Pairing notes — Round{" "}
        {typeof selectedRound === "number" ? selectedRound : "N/A"}
      </Typography>

      {decisionLog.byeReason && decisionLog.byePlayerName && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>{decisionLog.byePlayerName}</strong> received a bye (free win)
          this round
          {decisionLog.byePlayerPoints !== undefined &&
            ` · ${decisionLog.byePlayerPoints} pts`}
          {" — "}
          {humanizeByeReason(decisionLog.byeReason)}
        </Typography>
      )}

      {visibleFloats.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
            Score group adjustments:
          </Typography>
          <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2 }}>
            {visibleFloats.map((detail) => (
              <li key={detail.playerId}>
                <Typography variant="body2" component="span">
                  <strong>{detail.playerName}</strong> ({detail.playerPoints}{" "}
                  pts) — {humanizeFloatReason(detail.reason)}
                </Typography>
              </li>
            ))}
          </Box>
        </Box>
      )}

      {decisionLog.seatConflicts && decisionLog.seatConflicts.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
            Table assignments adjusted:
          </Typography>
          <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2 }}>
            {decisionLog.seatConflicts.map((sc, i) => (
              <li key={i}>
                <Typography variant="body2" component="span">
                  <strong>{sc.movedPlayerName}</strong> moved to table{" "}
                  {sc.resolvedSeat} (was table {sc.movedPlayerOriginalSeat}) to
                  avoid a table conflict with{" "}
                  <strong>{sc.opponentName}</strong>
                </Typography>
              </li>
            ))}
          </Box>
        </Box>
      )}

      {decisionLog.rematchCount > 0 && (
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          ⚠ {decisionLog.rematchCount} rematch
          {decisionLog.rematchCount !== 1 ? "es" : ""} this round — unavoidable
          given current standings
        </Typography>
      )}
      {decisionLog.rematchCount === 0 && (
        <Typography variant="body2" color="success.main">
          ✓ No player faced the same opponent twice
        </Typography>
      )}

      {decisionLog.maxFloatDistance > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 0.5, fontSize: "0.78rem" }}
        >
          Largest score gap between paired players: {decisionLog.maxFloatDistance}{" "}
          pt{decisionLog.maxFloatDistance !== 1 ? "s" : ""}
        </Typography>
      )}
    </Alert>
  );
}
