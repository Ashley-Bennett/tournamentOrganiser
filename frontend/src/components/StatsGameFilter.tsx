import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { getGame } from "../games/registry";

/**
 * Game picker for the stats page.
 *
 * Results are never mixed across games — a chess night and Pokémon locals are
 * two different records, and one combined win rate would describe neither. The
 * player picks a game and sees that game's full stats page.
 *
 * It renders nothing at all for a player who has only ever played one game, so
 * the single-game experience is exactly what it was before games existed.
 */
export default function StatsGameFilter({
  gameIds,
  value,
  onChange,
}: {
  gameIds: string[];
  value: string | null;
  onChange: (gameId: string) => void;
}) {
  if (gameIds.length < 2) return null;

  return (
    <Box mb={2}>
      <Box display="flex" flexWrap="wrap" gap={0.75} alignItems="center">
        <Typography variant="caption" color="text.secondary" mr={0.5}>
          Game
        </Typography>
        {gameIds.map((id) => (
          <Chip
            key={id}
            label={getGame(id).shortName}
            size="small"
            color={value === id ? "primary" : "default"}
            variant={value === id ? "filled" : "outlined"}
            // Guarded to match the period filter. A repeat pick is already
            // inert here because the value is a string and React bails out of
            // an identical state write, but that is a detail of the type
            // rather than something this component should rely on.
            onClick={() => value !== id && onChange(id)}
          />
        ))}
      </Box>
    </Box>
  );
}
