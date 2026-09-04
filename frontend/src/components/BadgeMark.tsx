import React from "react";
import { Box } from "@mui/material";
import {
  UNTIERED_HEX,
  UNTIERED_SHAPE,
  clipPathFor,
  radiusFor,
} from "../badges/shapes";
import type { BadgeDefinition, Tier } from "../badges/types";

/**
 * One badge, drawn.
 *
 * PLACEHOLDER ART. The container — tier shape, tier colour, sizing — is final;
 * what sits inside it is a letter standing in for a mark nobody has drawn yet.
 * The props are the ones the real component will take, so replacing the inside
 * is an edit rather than a rewrite, and every screen above this can be built
 * and reviewed before the artwork lands.
 *
 * Sizes match the brief: 26px on a player card, 46px in the badge case, 96px
 * for detail. Anything else is allowed but those three are what get designed
 * against.
 */
export default function BadgeMark({
  badge,
  tier,
  size = 46,
  title,
}: {
  badge: BadgeDefinition;
  /** Null for an untiered badge, which uses the plaque rather than a rung. */
  tier: Tier | null;
  size?: number;
  /** The worn title at this rung, used for the stand-in letter and the label. */
  title?: string;
}) {
  const shape = tier?.shape ?? UNTIERED_SHAPE;
  const fill = tier?.hex ?? UNTIERED_HEX;
  const clip = clipPathFor(shape);
  const label = title ?? badge.title;

  return (
    <Box
      role="img"
      aria-label={label}
      title={label}
      sx={{
        width: size,
        height: size,
        flex: "none",
        background: fill,
        clipPath: clip ?? undefined,
        borderRadius: radiusFor(shape, size),
        // A hairline so the shape is defined against its own background. The
        // white rung is all but invisible on a light card without it, and a
        // border cannot be used because clip-path cuts it away — a drop-shadow
        // follows the clipped silhouette instead.
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
      {label.trim().charAt(0).toUpperCase()}
    </Box>
  );
}
