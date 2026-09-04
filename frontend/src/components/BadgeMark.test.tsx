import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BadgeMark from "./BadgeMark";
import { TIERS, getBadge } from "../badges/registry";
import { tierFor } from "../badges/tiers";
import { UNTIERED_HEX } from "../badges/shapes";

const attendance = getBadge("attendance")!;
const spoiler = getBadge("spoiler")!;

const mark = () => screen.getByRole("img");

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
    expect(mark()).toHaveStyle({ background: TIERS[3].hex });
  });

  // Spoiler and Bubble have no rung. Giving them the circle would read as
  // white, the lowest tier, which is wrong for a mythic.
  it("uses the untiered fill for a badge with no tier", () => {
    render(<BadgeMark badge={spoiler} tier={null} />);
    expect(mark()).toHaveStyle({ background: UNTIERED_HEX });
  });

  it("honours the size it is given", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[0]} size={26} />);
    expect(mark()).toHaveStyle({ width: "26px", height: "26px" });
  });

  it("shows a stand-in letter until the artwork exists", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[2]} title="Regular" />);
    expect(mark()).toHaveTextContent("R");
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

  it("draws the tier the count resolves to", () => {
    // 8 events is bronze on Attendance's ladder.
    const tier = tierFor(attendance, 8);
    render(<BadgeMark badge={attendance} tier={tier} />);
    expect(mark()).toHaveStyle({ background: TIERS[1].hex });
  });
});
