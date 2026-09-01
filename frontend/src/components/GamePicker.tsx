import React, { useState } from "react";
import { Box, ButtonBase, Chip, Typography, useTheme } from "@mui/material";
import { GAMES } from "../games/registry";
import type { GameDefinition } from "../games/types";

/**
 * Game picker for the create-tournament dialog.
 *
 * Games that are not implemented yet are shown rather than hidden, so the
 * roadmap is visible, but cannot be selected. Tapping one explains itself in
 * a line under the grid — a tooltip would never fire on touch, which is where
 * most organisers create tournaments.
 */

function GameTile({
  game,
  selected,
  onSelect,
}: {
  game: GameDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const comingSoon = game.status === "coming_soon";

  return (
    <ButtonBase
      onClick={onSelect}
      focusRipple
      role="radio"
      aria-checked={selected}
      aria-label={comingSoon ? `${game.name} (coming soon)` : game.name}
      sx={{
        flexDirection: "column",
        gap: 0.5,
        px: 1,
        py: 1.5,
        borderRadius: 2,
        border: "2px solid",
        borderColor: selected ? game.accent : theme.palette.divider,
        bgcolor: selected ? `${game.accent}1A` : "transparent",
        color: comingSoon ? "text.disabled" : "text.primary",
        opacity: comingSoon ? 0.45 : 1,
        transition: theme.transitions.create(["border-color", "background-color"]),
        "&:hover": {
          borderColor: comingSoon ? theme.palette.divider : game.accent,
        },
      }}
    >
      {/*
        Masked rather than an <img>: the icons are drawn with currentColor,
        which an <img> cannot inherit — they would paint black and disappear
        against the dark theme. A mask tints them with the game's accent.
      */}
      <Box
        aria-hidden
        sx={{
          width: 32,
          height: 32,
          bgcolor: comingSoon ? "text.disabled" : game.accent,
          maskImage: `url(${game.iconSrc})`,
          WebkitMaskImage: `url(${game.iconSrc})`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
      <Typography variant="caption" sx={{ fontWeight: selected ? 700 : 500, lineHeight: 1.2 }}>
        {game.shortName}
      </Typography>
      {comingSoon && (
        <Chip
          label="Soon"
          size="small"
          sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
        />
      )}
    </ButtonBase>
  );
}

export default function GamePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (gameId: string) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Game
      </Typography>
      <Box
        role="radiogroup"
        aria-label="Game"
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
          gap: 1,
        }}
      >
        {GAMES.map((game) => (
          <GameTile
            key={game.id}
            game={game}
            selected={value === game.id}
            onSelect={() => {
              if (game.status === "coming_soon") {
                setNotice(`${game.name} support is coming after 1.0.`);
                return;
              }
              setNotice(null);
              onChange(game.id);
            }}
          />
        ))}
      </Box>
      {notice && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {notice}
        </Typography>
      )}
    </Box>
  );
}
