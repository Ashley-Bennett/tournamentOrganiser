import type { ContainerShape } from "./types";

/**
 * The tier ladder as CSS.
 *
 * The tier is carried by a shape as well as a colour, because at 26px on a
 * projector three metres away the colour is doing all the work and a shape is
 * the only thing still legible. The progression reads blank → cut → pointed →
 * radiant → gem, which people rank correctly without being taught it.
 *
 * Data-only, so both the placeholder mark and the real one can use it without
 * either importing the other.
 */
const CLIP: Record<ContainerShape, string | null> = {
  // No clip — a border-radius handles it, which antialiases better than a
  // polygon approximating a circle.
  circle: null,
  hexagon: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
  shield: "polygon(6% 0%, 94% 0%, 94% 62%, 50% 100%, 6% 62%)",
  star:
    "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, " +
    "21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  rhombus: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  // Untiered badges sit outside the ladder entirely, so the plaque must not
  // resemble any rung. A rounded rectangle is the one common shape left.
  plaque: null,
};

/** The clip-path for a shape, or null where CSS handles it another way. */
export function clipPathFor(shape: ContainerShape): string | null {
  return CLIP[shape] ?? null;
}

/** The border-radius for shapes that are rounded rather than clipped. */
export function radiusFor(shape: ContainerShape, size: number): string {
  if (shape === "circle") return "50%";
  if (shape === "plaque") return `${Math.max(3, Math.round(size * 0.22))}px`;
  return "0";
}

/**
 * The container an untiered badge sits in.
 *
 * Spoiler and Bubble have no tier, so they have no rung shape. Giving them the
 * circle would read as "white", the lowest rung, which is wrong for a mythic.
 */
export const UNTIERED_SHAPE: ContainerShape = "plaque";

/**
 * The colour of a badge with no tier. Purple, because no rung is anywhere
 * near it — a grey-blue here read as one more pale rung beside white and
 * silver, which is exactly what an untiered badge is not.
 */
export const UNTIERED_HEX = "#A77BFF";

/** Untiered badges glow at full strength; they are the rare ones. */
export const UNTIERED_GLOW = 1;
