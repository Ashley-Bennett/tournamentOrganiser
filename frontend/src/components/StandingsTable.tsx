import React, { useMemo } from "react";
import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import type { PlayerWithTieBreakers } from "../utils/tieBreaking";

interface Props {
  standings: PlayerWithTieBreakers[];
  /** player id → dropped_at_round (null = dropped, round unknown) */
  droppedMap: Map<string, number | null>;
}

const getRankDisplay = (rank: number): string => {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}`;
};

const getRowBg = (rank: number, isDropped: boolean) => {
  if (isDropped) return "action.hover";
  if (rank === 1) return "rgba(255, 215, 0, 0.1)";
  if (rank === 2) return "rgba(192, 192, 192, 0.1)";
  if (rank === 3) return "rgba(205, 127, 50, 0.1)";
  return "transparent";
};

const getHoverBg = (rank: number) => {
  if (rank === 1) return "rgba(255, 215, 0, 0.15)";
  if (rank === 2) return "rgba(192, 192, 192, 0.15)";
  if (rank === 3) return "rgba(205, 127, 50, 0.15)";
  return "rgba(0, 0, 0, 0.04)";
};

interface ChunkTableProps {
  chunk: PlayerWithTieBreakers[];
  rankOffset: number;
  droppedMap: Map<string, number | null>;
  size: "small" | "medium";
  /** vertical cell padding override (MUI spacing units) */
  cellPy?: number;
  /** horizontal cell padding override (MUI spacing units) */
  cellPx?: number;
}

const ChunkTable: React.FC<ChunkTableProps> = ({
  chunk,
  rankOffset,
  droppedMap,
  size,
  cellPy,
  cellPx,
}) => (
  <Paper sx={{ overflow: "hidden", height: "100%" }}>
    <TableContainer>
      <Table
        size={size}
        sx={{
          "& .MuiTableCell-root": {
            ...(cellPy !== undefined && { py: cellPy }),
            ...(cellPx !== undefined && { px: cellPx }),
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: "bold" }}>Rank</TableCell>
            <TableCell sx={{ fontWeight: "bold" }}>Player</TableCell>
            <TableCell sx={{ fontWeight: "bold" }} align="right">
              Record
            </TableCell>
            <TableCell sx={{ fontWeight: "bold" }} align="right">
              Pts
            </TableCell>
            <TableCell sx={{ fontWeight: "bold" }} align="right">
              OMW%
            </TableCell>
            <TableCell sx={{ fontWeight: "bold" }} align="right">
              OOMW%
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {chunk.map((player, idx) => {
            const rank = rankOffset + idx + 1;
            const isTopThree = rank <= 3;
            const droppedRound = droppedMap.get(player.id);
            const isDropped = droppedRound !== undefined;
            return (
              <TableRow
                key={player.id}
                sx={{
                  opacity: isDropped ? 0.65 : 1,
                  backgroundColor: getRowBg(rank, isDropped),
                  "&:hover": { backgroundColor: getHoverBg(rank) },
                }}
              >
                <TableCell>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {isTopThree && (
                      <EmojiEventsIcon
                        sx={{
                          color:
                            rank === 1
                              ? "gold"
                              : rank === 2
                                ? "silver"
                                : "#CD7F32",
                          fontSize: size === "small" ? "1rem" : "1.25rem",
                        }}
                      />
                    )}
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: isTopThree ? "bold" : "normal" }}
                    >
                      {getRankDisplay(rank)}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: isTopThree ? "bold" : "normal" }}
                  >
                    {player.name}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="flex-end"
                    gap={0.5}
                    sx={{ flexWrap: "nowrap" }}
                  >
                    {isDropped && (
                      <Chip
                        label={
                          droppedRound != null
                            ? `Dropped Rd ${droppedRound}`
                            : "Dropped"
                        }
                        size="small"
                        variant="outlined"
                        color="default"
                        sx={{ whiteSpace: "nowrap" }}
                      />
                    )}
                    <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                      {player.wins}-{player.losses}-{player.draws}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: isTopThree ? "bold" : "normal" }}
                  >
                    {player.matchPoints}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {(player.opponentMatchWinPercentage * 100).toFixed(1)}%
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {(player.opponentOpponentMatchWinPercentage * 100).toFixed(1)}%
                  </Typography>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  </Paper>
);

const StandingsTable: React.FC<Props> = ({ standings, droppedMap }) => {
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up("md"));
  const isLg = useMediaQuery(theme.breakpoints.up("lg"));

  const columnCount = useMemo(() => {
    const n = standings.length;
    if (isLg && n >= 12) return 3;
    if (isMd && n >= 6) return 2;
    return 1;
  }, [standings.length, isMd, isLg]);

  const chunks = useMemo(() => {
    const chunkSize = Math.ceil(standings.length / columnCount);
    return Array.from({ length: columnCount }, (_, i) =>
      standings.slice(i * chunkSize, (i + 1) * chunkSize),
    );
  }, [standings, columnCount]);

  // Progressively tighten density as column count increases
  const tableSize = columnCount > 1 ? "small" : "medium";
  const cellPy = columnCount === 3 ? 0.4 : columnCount === 2 ? 0.6 : undefined;
  // Reduce horizontal padding in multi-col so 6 columns fit without overflow
  const cellPx = columnCount === 3 ? 0.75 : columnCount === 2 ? 1 : undefined;

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "stretch", height: "100%" }}>
      {chunks.map((chunk, colIdx) => (
        <Box key={colIdx} sx={{ flex: 1, minWidth: 0 }}>
          <ChunkTable
            chunk={chunk}
            rankOffset={colIdx * Math.ceil(standings.length / columnCount)}
            droppedMap={droppedMap}
            size={tableSize}
            cellPy={cellPy}
            cellPx={cellPx}
          />
        </Box>
      ))}
    </Box>
  );
};

export default StandingsTable;
