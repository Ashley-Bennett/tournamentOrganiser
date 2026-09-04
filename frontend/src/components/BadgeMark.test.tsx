import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BadgeMark from "./BadgeMark";
import { TIERS, getBadge } from "../badges/registry";
import { tierFor } from "../badges/tiers";
import { UNTIERED_HEX } from "../badges/shapes";

const attendance = getBadge("attendance")!;
const spoiler = getBadge("spoiler")!;

/** The labelled wrapper: sizing, and the counter that hangs off the shape. */
const mark = () => screen.getByRole("img");

/**
 * The shape itself. It is a child rather than the wrapper because clip-path
 * would cut the counter away, so the fill lives one level in.
 */
const shape = () => mark().firstElementChild as HTMLElement;

describe("BadgeMark", () => {
  it("labels itself with the worn title, not the badge's catalogue name", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[1]} title="Regular" />);
    expect(screen.getByRole("img", { name: "Regular" })).toBeInTheDocument();
  });

  it("falls back to the catalogue name when no title is given", () => {
    render(<BadgeMark badge={attendance} tier={null} />);
    expect(screen.getByRole("img", { name: "Attendance" })).toBeInTheDocument();
  });

  it("takes its fill from the tier", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[3]} />);
    // Gold.
    expect(shape()).toHaveStyle({ background: TIERS[3].hex });
  });

  // Spoiler and Bubble have no rung. Giving them the circle would read as
  // white, the lowest tier, which is wrong for a mythic.
  it("uses the untiered fill for a badge with no tier", () => {
    render(<BadgeMark badge={spoiler} tier={null} />);
    expect(shape()).toHaveStyle({ background: UNTIERED_HEX });
  });

  it("honours the size it is given", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[0]} size={26} />);
    expect(mark()).toHaveStyle({ width: "26px", height: "26px" });
  });

  it("shows a stand-in letter until the artwork exists", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[2]} title="Regular" />);
    expect(shape()).toHaveTextContent("R");
  });

  // Every rung shape must be reachable — a count resolving to a tier whose
  // shape does not render is the failure this guards.
  it("renders at every rung without throwing", () => {
    TIERS.forEach((tier) => {
      const { unmount } = render(
        <BadgeMark badge={attendance} tier={tier} title={tier.label} />,
      );
      expect(screen.getByRole("img")).toBeInTheDocument();
      unmount();
    });
  });

  it("shows a counter on a badge that counts", () => {
    render(
      <BadgeMark badge={attendance} tier={TIERS[1]} title="Regular" count={12} />,
    );
    expect(screen.getByRole("img", { name: "Regular, 12" })).toBeInTheDocument();
    expect(mark()).toHaveTextContent("12");
  });

  // Spoiler either happened or it did not; a "1" would invite the question of
  // what a 2 would mean.
  it("shows no counter on a badge that does not count", () => {
    render(<BadgeMark badge={spoiler} tier={null} title="Spoiler" count={1} />);
    expect(mark()).not.toHaveTextContent("1");
  });

  // Below about 32px the numeral is illegible, so it is dropped rather than
  // drawn as a smudge.
  it("drops the counter when the badge is too small to read one", () => {
    render(
      <BadgeMark badge={attendance} tier={TIERS[1]} title="Regular" count={12} size={26} />,
    );
    expect(mark()).not.toHaveTextContent("12");
  });

  it("draws the tier the count resolves to", () => {
    // 8 events is bronze on Attendance's ladder.
    const tier = tierFor(attendance, 8);
    render(<BadgeMark badge={attendance} tier={tier} />);
    expect(shape()).toHaveStyle({ background: TIERS[1].hex });
  });
});
