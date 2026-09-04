import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerCardView from "./PlayerCardView";
import { assembleCard, type CardSlot } from "../badges/card";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const slot = (over: Partial<CardSlot> = {}): CardSlot => ({
  slot: 1,
  badgeId: "top_cut",
  count: 4,
  workspaceId: null,
  workspaceName: null,
  ...over,
});

const cardWith = (slots: CardSlot[], partnerKey: string | null = "25") =>
  assembleCard({ gameId: "pokemon", partnerKey, slots });

const titleSlot = slot({
  slot: 0,
  badgeId: "attendance",
  count: 8,
  workspaceId: WS,
  workspaceName: "Bulwark",
});

describe("full density", () => {
  it("shows the worn title, the name and the badge's explanation", () => {
    render(<PlayerCardView name="Marcus Hale" card={cardWith([titleSlot])} />);

    expect(screen.getByText("Familiar Face · Bulwark")).toBeInTheDocument();
    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(screen.getByText("Events finished here")).toBeInTheDocument();
  });

  it("draws every equipped badge", () => {
    render(
      <PlayerCardView
        name="Marcus Hale"
        card={cardWith([
          titleSlot,
          slot({ slot: 1, badgeId: "top_cut", count: 4 }),
          slot({ slot: 2, badgeId: "champion", count: 2 }),
        ])}
      />,
    );
    // Title marks are text, not images; the badge row is the images.
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  // The majority case at launch, and the easiest to leave looking broken.
  it("renders a bare card as just a name", () => {
    render(<PlayerCardView name="Marcus Hale" card={cardWith([])} />);

    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("omits the partner entirely when there is nothing to draw", () => {
    const card = assembleCard({ gameId: null, partnerKey: null, slots: [] });
    render(<PlayerCardView name="Marcus Hale" card={card} />);

    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
  });

  // A declared set ships vectors already framed; species art does not, so only
  // one of the two gets normalised.
  it("draws a declared-set partner as a plain image", () => {
    const card = assembleCard({
      gameId: "generic",
      partnerKey: "knight",
      slots: [],
    });
    render(<PlayerCardView name="Jon Baker" card={card} />);

    const img = screen.getByRole("presentation", { hidden: true });
    expect(img).toHaveAttribute("src", "/partners/generic/knight.svg");
  });

  it("survives a badge the registry has never heard of", () => {
    render(
      <PlayerCardView
        name="Marcus Hale"
        card={cardWith([slot({ slot: 1, badgeId: "not_shipped_yet" })])}
      />,
    );
    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("line density", () => {
  it("shows the name with the title beneath it", () => {
    render(
      <PlayerCardView
        name="Marcus Hale"
        card={cardWith([titleSlot])}
        density="line"
      />,
    );

    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(screen.getByText("Familiar Face · Bulwark")).toBeInTheDocument();
  });

  // A reserved-but-empty slot on half the rows reads as broken; a ragged list
  // does not.
  it("renders nothing but the name when no title is equipped", () => {
    const { container } = render(
      <PlayerCardView name="Marcus Hale" card={cardWith([])} density="line" />,
    );

    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(container.textContent).toBe("Marcus Hale");
  });

  it("shows no partner and no badges, whatever is equipped", () => {
    render(
      <PlayerCardView
        name="Marcus Hale"
        card={cardWith([
          titleSlot,
          slot({ slot: 1, badgeId: "champion", count: 3 }),
        ])}
        density="line"
      />,
    );

    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("awkward content", () => {
  it("keeps a very long name on one line", () => {
    const long = "Bartholomew Fitzwilliam-Cholmondeley the Third";
    render(<PlayerCardView name={long} card={cardWith([titleSlot])} />);
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  it("renders a title with no league without a dangling separator", () => {
    render(
      <PlayerCardView
        name="Marcus Hale"
        card={cardWith([slot({ slot: 0, badgeId: "champion", count: 3 })])}
      />,
    );
    expect(screen.getByText("Hat Trick")).toBeInTheDocument();
  });
});
