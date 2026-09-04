import { Typography } from "@mui/material";
import type { PlayerCard } from "../badges/card";

/**
 * The title a player is wearing, drawn under their name.
 *
 * Deliberately just the title, not the whole card. The pairing board and the
 * standings are lists people scan for their own name across a room, and three
 * badges and a partner beside every row is a wall of art nobody can read
 * through. The card proper lives where somebody chose to look at it.
 *
 * Renders nothing at all when no title is worn. A reserved-but-empty line on
 * half the rows reads as broken where a ragged list does not, and most players
 * will have nothing on for a long time yet.
 *
 * The count is not shown here even though the badge carries one: on a board
 * the title is a name, and "Regular · Bulwark ×31" is a statistic.
 */
export default function WornTitle({
  card,
  align = "left",
  size = "caption",
}: {
  card: PlayerCard | undefined;
  align?: "left" | "center";
  /** "caption" in a list; "body2" where the name itself is large. */
  size?: "caption" | "body2";
}) {
  if (!card?.title) return null;

  return (
    <Typography
      variant={size}
      noWrap
      sx={{
        display: "block",
        textAlign: align,
        color: "text.secondary",
        fontWeight: 500,
        lineHeight: 1.3,
      }}
    >
      {card.title.label}
    </Typography>
  );
}
