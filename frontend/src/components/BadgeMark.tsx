import React from "react";
import { Box } from "@mui/material";
import {
  UNTIERED_GLOW,
  UNTIERED_HEX,
  UNTIERED_SHAPE,
  clipPathFor,
  radiusFor,
} from "../badges/shapes";
import { isTiered } from "../badges/registry";
import type { BadgeDefinition, ContainerShape, Tier } from "../badges/types";

/**
 * One badge, drawn.
 *
 * The art says which badge; the tier colour says which rung. A badge with no
 * art yet, or whose image fails to load, shows the first letter of its title
 * instead.
 *
 * Two frames, while we decide between them:
 *  - "outline" traces the art's own silhouette in the tier colour and adds a
 *    glow. The art is the same size on every rung.
 *  - "shape" sits the art inside a tier-shaped container. The shape carries
 *    the tier without colour, but the star and rhombus leave the art small.
 */
export type BadgeFrame = "outline" | "shape";

/** Below this the counter is illegible, so it is dropped rather than drawn. */
const MIN_SIZE_FOR_COUNT = 32;

/**
 * How much of the container the art may fill, per shape. Each is roughly the
 * largest centred square that stays inside the silhouette — the rhombus and
 * the star lose their corners to the clip, so their art has to be smaller.
 */
const ART_SCALE: Record<ContainerShape, number> = {
  circle: 0.7,
  hexagon: 0.68,
  shield: 0.62,
  star: 0.42,
  rhombus: 0.52,
  plaque: 0.74,
};

/** In the outline frame, the art leaves room in its box for the outline. */
const OUTLINE_ART_SCALE = 0.86;

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
  frame = "outline",
}: {
  badge: BadgeDefinition;
  /** Null for an untiered badge, which uses the plaque rather than a rung. */
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
  frame?: BadgeFrame;
}) {
  const shape = tier?.shape ?? UNTIERED_SHAPE;
  const fill = tier?.hex ?? UNTIERED_HEX;
  const glow = tier?.glow ?? UNTIERED_GLOW;
  const clip = clipPathFor(shape);
  const label = title ?? badge.title;
  const outlined = frame === "outline";

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
  const artSize = Math.round(
    size * (outlined ? OUTLINE_ART_SCALE : ART_SCALE[shape]),
  );

  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        // Room for the counter to hang below the shape without being clipped
        // by a parent — the shape itself cannot hold it, since clip-path would
        // cut it away.
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
          fontFamily: "monospace",
          fontWeight: 600,
          lineHeight: 1,
          userSelect: "none",
          ...(outlined
            ? {
                // Dark ink inside a tier-coloured outline reads on both themes.
                color: "#16202F",
                fontSize: Math.round(size * 0.6),
                filter: (theme) =>
                  outlineFilter(fill, glow, size, theme.palette.mode),
              }
            : {
                background: fill,
                clipPath: clip ?? undefined,
                borderRadius: radiusFor(shape, size),
                // A hairline so the shape is defined against its own
                // background. The white rung is all but invisible on a light
                // card without it, and a border cannot be used because
                // clip-path cuts it away — a drop-shadow follows the clipped
                // silhouette instead.
                filter: (theme) =>
                  `drop-shadow(0 0 1px ${
                    theme.palette.mode === "light"
                      ? "rgba(18,26,40,.30)"
                      : "rgba(255,255,255,.22)"
                  })`,
                // Every rung colour is light or mid, so dark ink reads on all
                // five.
                color: "#16202F",
                // The star loses a lot of its area to points, so its letter
                // needs to be smaller than the others to stay inside the shape.
                fontSize: Math.round(size * (shape === "star" ? 0.3 : 0.42)),
              }),
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
