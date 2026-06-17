import { ReactNode } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import type { MatchWithPlayers } from "../../types/match";
import type { TournamentSummary } from "../../types/tournament";

interface Props {
  selectedRound: number | "standings";
  matches: MatchWithPlayers[];
  pendingResults: Map<string, unknown>;
  tournament: TournamentSummary;
  hoveredRound: number | null;
  setHoveredRound: (r: number | null) => void;
  onSelectRound: (value: number | "standings") => void;
  onAddRound: () => void;
  onRequestDeleteRound: (round: number) => void;
}

export default function RoundTabs({
  selectedRound,
  matches,
  pendingResults,
  tournament,
  hoveredRound,
  setHoveredRound,
  onSelectRound,
  onAddRound,
  onRequestDeleteRound,
}: Props) {
  const totalRounds = tournament.num_rounds ?? 1;
  const roundNumbers = Array.from({ length: totalRounds }, (_, i) => i + 1);
  const hasMatchesForStandings = matches.length > 0;

  const finalRoundNum = tournament.num_rounds;
  const finalRoundMatches = finalRoundNum
    ? matches.filter(
        (m) =>
          m.round_number === finalRoundNum &&
          !(m.player2_id === null && m.result === "loss" && m.status === "completed"),
      )
    : [];
  const finalRoundComplete =
    finalRoundMatches.length > 0 &&
    finalRoundMatches.every((m) => m.status === "completed" || m.status === "bye");

  const tabValue =
    selectedRound === "standings"
      ? "standings"
      : Math.min(typeof selectedRound === "number" ? selectedRound : 1, totalRounds);

  return (
    <Tabs
      value={tabValue}
      onChange={(_, value: number | string) => {
        if (value === "add") {
          onAddRound();
          return;
        }
        onSelectRound(value === "standings" ? "standings" : (value as number));
      }}
      variant="scrollable"
      scrollButtons="auto"
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        "& .MuiTab-root": { minHeight: 48 },
        "& .Mui-disabled": { opacity: 0.5 },
      }}
    >
      {roundNumbers.map((roundNumber) => {
        const roundMatches = matches.filter(
          (m) =>
            m.round_number === roundNumber &&
            !(m.player2_id === null && m.result === "loss" && m.status === "completed"),
        );
        const hasMatches = roundMatches.length > 0;
        const completedCount = roundMatches.filter(
          (m) => m.status === "completed" || m.status === "bye",
        ).length;
        const allDone = hasMatches && completedCount === roundMatches.length;
        const hasPendingForRound = hasMatches && roundMatches.some((m) => pendingResults.has(m.id));

        let indicator: ReactNode = null;
        if (hasMatches) {
          if (allDone) {
            indicator = (
              <Box
                component="span"
                sx={{ color: "success.main", ml: 0.5, lineHeight: 1 }}
              >
                ✓
              </Box>
            );
          } else if (hasPendingForRound) {
            indicator = (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "warning.main",
                  ml: 0.75,
                  verticalAlign: "middle",
                  mb: "1px",
                }}
              />
            );
          } else if (completedCount > 0) {
            indicator = (
              <Box
                component="span"
                sx={{ color: "text.secondary", ml: 0.5, fontSize: "0.7rem" }}
              >
                {completedCount}/{roundMatches.length}
              </Box>
            );
          }
        }

        const isLastRound = roundNumber === totalRounds;
        const canDelete = !hasMatches && isLastRound && tournament.status === "active";

        return (
          <Tab
            key={roundNumber}
            label={
              <Box
                display="flex"
                alignItems="center"
                onMouseEnter={() => canDelete && setHoveredRound(roundNumber)}
                onMouseLeave={() => setHoveredRound(null)}
              >
                {`Round ${roundNumber}`}
                {indicator}
                {canDelete && (
                  <CloseIcon
                    fontSize="inherit"
                    sx={{
                      ml: 0.75,
                      fontSize: 14,
                      cursor: "pointer",
                      opacity: hoveredRound === roundNumber ? 1 : 0.3,
                      color:
                        hoveredRound === roundNumber ? "error.main" : "text.secondary",
                      transition: "opacity 0.15s, color 0.15s",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDeleteRound(roundNumber);
                    }}
                  />
                )}
              </Box>
            }
            value={roundNumber}
            sx={
              hasMatches
                ? {}
                : { color: "text.secondary", fontWeight: 500, opacity: 0.5 }
            }
          />
        );
      })}
      {tournament.status === "active" &&
        (tournament.num_rounds ?? 0) < 20 &&
        !finalRoundComplete && (
          <Tab
            icon={<AddIcon fontSize="small" />}
            value="add"
            title="Add round"
            sx={{ minWidth: 44, px: 1 }}
          />
        )}
      <Tab
        label="Final Standings"
        value="standings"
        disabled={!hasMatchesForStandings}
        sx={
          hasMatchesForStandings
            ? {}
            : { color: "text.secondary", fontWeight: 500 }
        }
      />
    </Tabs>
  );
}
