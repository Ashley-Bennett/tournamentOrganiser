import React from "react";
import { Box } from "@mui/material";
import {
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
 * The container — tier shape, tier colour, sizing, the count — says which
 * rung; the art inside it says which badge. A badge with no art yet, or whose
 * image fails to load, shows the first letter of its title instead.
 */

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

export default function BadgeMark({
  badge,
  tier,
  size = 46,
  title,
  count,
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
}) {
  const shape = tier?.shape ?? UNTIERED_SHAPE;
  const fill = tier?.hex ?? UNTIERED_HEX;
  const clip = clipPathFor(shape);
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
          background: fill,
          clipPath: clip ?? undefined,
          borderRadius: radiusFor(shape, size),
          // A hairline so the shape is defined against its own background. The
          // white rung is all but invisible on a light card without it, and a
          // border cannot be used because clip-path cuts it away — a
          // drop-shadow follows the clipped silhouette instead.
          filter: (theme) =>
            `drop-shadow(0 0 1px ${
              theme.palette.mode === "light"
                ? "rgba(18,26,40,.30)"
                : "rgba(255,255,255,.22)"
            })`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Every rung colour is light or mid, so dark ink reads on all five.
          color: "#16202F",
          fontFamily: "monospace",
          fontWeight: 600,
          // The star loses a lot of its area to points, so its letter needs to
          // be smaller than the others to stay inside the shape.
          fontSize: Math.round(size * (shape === "star" ? 0.3 : 0.42)),
          lineHeight: 1,
          userSelect: "none",
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
              width: Math.round(size * ART_SCALE[shape]),
              height: Math.round(size * ART_SCALE[shape]),
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
