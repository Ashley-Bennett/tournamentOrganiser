import React, { useState } from "react";
import {
  Box,
  Typography,
  Collapse,
  Paper,
  ButtonBase,
  Chip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import type { PairingDecisionLog } from "../../utils/tournamentPairing";
import { humanizeByeReason, humanizeFloatReason } from "../../types/match";

interface Props {
  decisionLog: PairingDecisionLog | null | undefined;
  selectedRound: number | "standings";
}

export default function PairingDecisionAlert({ decisionLog, selectedRound }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!decisionLog) return null;

  const visibleFloats = (decisionLog.floatDetails ?? []).filter(
    (d) =>
      !d.reason.startsWith("DISSOLVE:") &&
      !d.reason.includes("bye (last bracket"),
  );

  const hasAnyNotes =
    !!decisionLog.byeReason ||
    visibleFloats.length > 0 ||
    decisionLog.rematchCount > 0 ||
    (decisionLog.seatConflicts?.length ?? 0) > 0;

  if (!hasAnyNotes) return null;

  // Summary chips shown in the collapsed header
  const summaryParts: React.ReactNode[] = [];
  if (decisionLog.rematchCount > 0) {
    summaryParts.push(
      <Chip
        key="rematch"
        label={`${decisionLog.rematchCount} rematch${decisionLog.rematchCount !== 1 ? "es" : ""}`}
        size="small"
        color="warning"
        variant="outlined"
        sx={{ fontSize: "0.7rem", height: 20 }}
      />,
    );
  }
  if (visibleFloats.length > 0) {
    summaryParts.push(
      <Chip
        key="floats"
        label={`${visibleFloats.length} score-group adjustment${visibleFloats.length !== 1 ? "s" : ""}`}
        size="small"
        variant="outlined"
        sx={{ fontSize: "0.7rem", height: 20 }}
      />,
    );
  }
  if (decisionLog.byeReason) {
    summaryParts.push(
      <Chip
        key="bye"
        label="bye assigned"
        size="small"
        variant="outlined"
        sx={{ fontSize: "0.7rem", height: 20 }}
      />,
    );
  }

  return (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      <ButtonBase
        onClick={() => setExpanded((v) => !v)}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          textAlign: "left",
          borderRadius: "inherit",
          gap: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mr: 0.5 }}>
            Pairing notes
            {typeof selectedRound === "number" ? ` — Round ${selectedRound}` : ""}
          </Typography>
          {summaryParts}
        </Box>
        {expanded ? (
          <ExpandLessIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} />
        ) : (
          <ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} />
        )}
      </ButtonBase>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>

          {decisionLog.byeReason && decisionLog.byePlayerName && (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Bye
              </Typography>
              <Typography variant="body2">
                <strong>{decisionLog.byePlayerName}</strong> received a bye (free win)
                {decisionLog.byePlayerPoints !== undefined &&
                  ` · ${decisionLog.byePlayerPoints} pts`}
                {" — "}
                {humanizeByeReason(decisionLog.byeReason)}
              </Typography>
            </Box>
          )}

          {decisionLog.rematchCount > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Forced rematches ({decisionLog.rematchCount})
              </Typography>
              {decisionLog.rematchPairs && decisionLog.rematchPairs.length > 0 ? (
                <Box component="ul" sx={{ mt: 0, mb: 0, pl: 2 }}>
                  {decisionLog.rematchPairs.map((rp, i) => (
                    <li key={i}>
                      <Typography variant="body2" component="span">
                        <strong>{rp.player1Name}</strong> vs{" "}
                        <strong>{rp.player2Name}</strong>
                        {" — "}unavoidable, all opponents in this score group already met
                      </Typography>
                    </li>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {decisionLog.rematchCount} rematch
                  {decisionLog.rematchCount !== 1 ? "es" : ""} — unavoidable given current standings
                </Typography>
              )}
            </Box>
          )}

          {visibleFloats.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Score group adjustments
              </Typography>
              <Box component="ul" sx={{ mt: 0, mb: 0, pl: 2 }}>
                {visibleFloats.map((detail) => (
                  <li key={detail.playerId}>
                    <Typography variant="body2" component="span">
                      <strong>{detail.playerName}</strong> ({detail.playerPoints} pts)
                      {" — "}
                      {humanizeFloatReason(detail.reason)}
                    </Typography>
                  </li>
                ))}
              </Box>
            </Box>
          )}

          {decisionLog.seatConflicts && decisionLog.seatConflicts.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Table assignments adjusted
              </Typography>
              <Box component="ul" sx={{ mt: 0, mb: 0, pl: 2 }}>
                {decisionLog.seatConflicts.map((sc, i) => (
                  <li key={i}>
                    <Typography variant="body2" component="span">
                      <strong>{sc.movedPlayerName}</strong> moved to table{" "}
                      {sc.resolvedSeat} (was table {sc.movedPlayerOriginalSeat}) to avoid a
                      conflict with <strong>{sc.opponentName}</strong>
                    </Typography>
                  </li>
                ))}
              </Box>
            </Box>
          )}

          {decisionLog.rematchCount === 0 && (
            <Typography variant="body2" color="success.main" sx={{ mb: 0.5 }}>
              ✓ No player faced the same opponent twice
            </Typography>
          )}

          {decisionLog.maxFloatDistance > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.78rem" }}>
              Largest score gap between paired players: {decisionLog.maxFloatDistance}{" "}
              pt{decisionLog.maxFloatDistance !== 1 ? "s" : ""}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
