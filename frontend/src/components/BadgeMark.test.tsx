import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BadgeMark from "./BadgeMark";
import { BADGES, TIERS, UNTIERED_HEX, getBadge } from "../badges/registry";
import { tierFor } from "../badges/tiers";

const attendance = getBadge("attendance")!;
const spoiler = getBadge("spoiler")!;

/** The labelled wrapper: sizing, and the counter that hangs off the art. */
const mark = () => screen.getByRole("img");

/**
 * The outlined art. A child rather than the wrapper, so the outline filter
 * does not also trace the counter.
 */
const outlined = () => mark().firstElementChild as HTMLElement;

const filterOf = () => getComputedStyle(outlined()).filter;

describe("BadgeMark", () => {
  it("labels itself with the worn title, not the badge's catalogue name", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[1]} title="Regular" />);
    expect(screen.getByRole("img", { name: "Regular" })).toBeInTheDocument();
  });

  it("falls back to the catalogue name when no title is given", () => {
    render(<BadgeMark badge={attendance} tier={null} />);
    expect(screen.getByRole("img", { name: "Attendance" })).toBeInTheDocument();
  });

  it("outlines the art in the tier colour", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[3]} />);
    // Gold.
    expect(filterOf()).toContain(TIERS[3].hex);
  });

  // Spoiler and Bubble have no rung. Borrowing a pale colour would read as one
  // more rung of the ladder, which is wrong for a mythic.
  it("uses the untiered colour for a badge with no tier", () => {
    render(<BadgeMark badge={spoiler} tier={null} />);
    expect(filterOf()).toContain(UNTIERED_HEX);
  });

  // A tiered badge nobody has reached yet is locked, not special.
  it("draws a tiered badge with no rung yet on white, not the untiered colour", () => {
    render(<BadgeMark badge={attendance} tier={null} />);
    expect(filterOf()).toContain(TIERS[0].hex);
    expect(filterOf()).not.toContain(UNTIERED_HEX);
  });

  // White and silver are both pale; the glow is what tells them apart.
  it("glows on silver but not on white", () => {
    const blurred = (tier: (typeof TIERS)[number]) => {
      const { unmount } = render(<BadgeMark badge={attendance} tier={tier} />);
      const glows = /drop-shadow\(0 0 [1-9]\d*px #/.test(filterOf());
      unmount();
      return glows;
    };
    expect(blurred(TIERS[0])).toBe(false);
    expect(blurred(TIERS[2])).toBe(true);
  });

  it("honours the size it is given", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[0]} size={26} />);
    expect(mark()).toHaveStyle({ width: "26px", height: "26px" });
  });

  it("draws the badge's art", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[2]} title="Regular" />);
    const art = outlined().querySelector("img");
    expect(art).toHaveAttribute("src", "/badges/attendance.png");
    expect(outlined()).not.toHaveTextContent("R");
  });

  // Every registered badge has art, so a missing file would otherwise only
  // show up as a broken image in the running app.
  it("gives every registered badge art", () => {
    BADGES.forEach((badge) => expect(badge.artSrc).toBeTruthy());
  });

  it("shows a stand-in letter for a badge with no art", () => {
    const undrawn = { ...attendance, artSrc: undefined };
    render(<BadgeMark badge={undrawn} tier={TIERS[2]} title="Regular" />);
    expect(outlined()).toHaveTextContent("R");
    expect(outlined().querySelector("img")).toBeNull();
  });

  it("falls back to the letter when the art fails to load", () => {
    render(<BadgeMark badge={attendance} tier={TIERS[2]} title="Regular" />);
    fireEvent.error(outlined().querySelector("img")!);
    expect(outlined()).toHaveTextContent("R");
  });

  // Every rung must be reachable — a count resolving to a tier that does not
  // render is the failure this guards.
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
    expect(filterOf()).toContain(TIERS[1].hex);
  });
});
