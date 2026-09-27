import React from "react";
import { Box } from "@mui/material";
import { TIERS, UNTIERED_GLOW, UNTIERED_HEX, isTiered } from "../badges/registry";
import type { BadgeDefinition, Tier } from "../badges/types";

/**
 * One badge, drawn.
 *
 * The art says which badge; an outline traced around the art's own silhouette,
 * and a glow off it, say which rung. The art is the same size on every rung. A
 * badge with no art yet, or whose image fails to load, shows the first letter
 * of its title instead.
 */

/** Below this the counter is illegible, so it is dropped rather than drawn. */
const MIN_SIZE_FOR_COUNT = 32;

/** The art leaves room in its box for the outline. */
const ART_SCALE = 0.86;

/**
 * The outline and glow, as a filter chain.
 *
 * drop-shadow follows the image's alpha, so four unblurred shadows one step
 * out in each direction trace the silhouette — and because each shadow is
 * applied to the result of the one before, the diagonals fill in too. The
 * blurred shadows after them glow off the outline rather than the art.
 */
function outlineFilter(
  colour: string,
  strength: number,
  size: number,
  mode: "light" | "dark",
) {
  const w = Math.max(1, Math.round(size / 40));
  const glow = Math.max(2, Math.round(size * 0.08 * strength));
  return [
    `drop-shadow(${w}px 0 0 ${colour})`,
    `drop-shadow(-${w}px 0 0 ${colour})`,
    `drop-shadow(0 ${w}px 0 ${colour})`,
    `drop-shadow(0 -${w}px 0 ${colour})`,
    // The white rung vanishes against a light card, so give it an edge there.
    ...(mode === "light" ? ["drop-shadow(0 0 1px rgba(18,26,40,.45))"] : []),
    // No glow at all on the lowest rung — the glow is what you earn.
    ...(strength > 0
      ? [
          `drop-shadow(0 0 ${glow}px ${colour})`,
          `drop-shadow(0 0 ${Math.max(1, Math.round(glow / 2))}px ${colour})`,
        ]
      : []),
  ].join(" ");
}

export default function BadgeMark({
  badge,
  tier,
  size = 46,
  title,
  count,
}: {
  badge: BadgeDefinition;
  /**
   * Null for an untiered badge, which uses the untiered colour — or for a
   * tiered one not yet reached, which is drawn on the bottom rung.
   */
  tier: Tier | null;
  size?: number;
  /** The worn title at this rung, used for the stand-in letter and the label. */
  title?: string;
  /**
   * How many. Shown on a counter sitting on the badge's lower edge, and only
   * for a badge that counts — Spoiler and Bubble either happened or did not,
   * and a "1" on one would invite the question of what a 2 would mean.
   */
  count?: number;
}) {
  // A locked Champion must not borrow the untiered purple, or it reads as a
  // special badge rather than one you have not earned yet.
  const rung = tier ?? (isTiered(badge) ? TIERS[0] : null);
  const colour = rung?.hex ?? UNTIERED_HEX;
  const glow = rung?.glow ?? UNTIERED_GLOW;
  const label = title ?? badge.title;

  // Reset when the badge changes, so one broken image does not leave every
  // later badge in this slot on the letter.
  const [artFailed, setArtFailed] = React.useState(false);
  React.useEffect(() => setArtFailed(false), [badge.artSrc]);
  const showArt = Boolean(badge.artSrc) && !artFailed;

  const showCount =
    isTiered(badge) &&
    typeof count === "number" &&
    count > 0 &&
    size >= MIN_SIZE_FOR_COUNT;

  const counterSize = Math.round(size * 0.4);
  const artSize = Math.round(size * ART_SCALE);

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        // Room for the counter to hang below the art without being clipped by
        // a parent.
        height: showCount ? size + Math.round(counterSize * 0.3) : size,
        flex: "none",
      }}
      role="img"
      aria-label={showCount ? `${label}, ${count}` : label}
      title={showCount ? `${label} · ${count}` : label}
    >
      <Box
        aria-hidden
        sx={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Dark ink inside a tier-coloured outline reads on both themes.
          color: "#16202F",
          fontFamily: "monospace",
          fontWeight: 600,
          fontSize: Math.round(size * 0.6),
          lineHeight: 1,
          userSelect: "none",
          filter: (theme) =>
            outlineFilter(colour, glow, size, theme.palette.mode),
        }}
      >
        {showArt ? (
          <Box
            component="img"
            src={badge.artSrc}
            alt=""
            draggable={false}
            onError={() => setArtFailed(true)}
            sx={{
              width: artSize,
              height: artSize,
              // The art is pixel art; smoothing it on scale-up blurs it.
              imageRendering: "pixelated",
              pointerEvents: "none",
            }}
          />
        ) : (
          label.trim().charAt(0).toUpperCase()
        )}
      </Box>

      {showCount && (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            left: "50%",
            top: size,
            transform: "translate(-50%, -55%)",
            width: counterSize,
            height: counterSize,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Its own surface rather than the tier colour, so the number stays
            // readable whichever rung it is sitting on.
            bgcolor: "background.paper",
            color: "text.primary",
            border: "1px solid",
            borderColor: "divider",
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: Math.max(9, Math.round(counterSize * 0.6)),
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  );
}
