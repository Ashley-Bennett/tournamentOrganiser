import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WornTitle from "./WornTitle";
import { assembleCard, type CardSlot } from "../badges/card";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const cardWith = (slots: CardSlot[]) =>
  assembleCard({ gameId: "pokemon", partnerKey: "25", slots });

const title: CardSlot = {
  slot: 0,
  badgeId: "attendance",
  count: 31,
  workspaceId: WS,
  workspaceName: "Bulwark",
};

describe("WornTitle", () => {
  it("draws the worn title with its league", () => {
    render(<WornTitle card={cardWith([title])} />);
    expect(screen.getByText("Regular · Bulwark")).toBeInTheDocument();
  });

  // A reserved-but-empty line on half the rows reads as broken; most players
  // will have nothing on for a long time yet.
  it("renders nothing when no title is worn", () => {
    const { container } = render(<WornTitle card={cardWith([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  // The board and the standings both have rows for players with no account.
  it("renders nothing when there is no card at all", () => {
    const { container } = render(<WornTitle card={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  // On a board the title is a name; "Regular · Bulwark ×31" is a statistic.
  it("leaves the count off", () => {
    render(<WornTitle card={cardWith([title])} />);
    expect(screen.queryByText(/31/)).toBeNull();
  });

  // Equipped badges are not drawn here — three badges and a partner beside
  // every row is a wall of art nobody can read through.
  it("draws only the title, never the badge row", () => {
    render(
      <WornTitle
        card={cardWith([
          title,
          { slot: 1, badgeId: "champion", count: 3, workspaceId: null, workspaceName: null },
        ])}
      />,
    );
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryByText("Hat Trick")).toBeNull();
  });

  it("survives a title whose badge the registry has never heard of", () => {
    const { container } = render(
      <WornTitle
        card={cardWith([{ ...title, badgeId: "not_shipped_yet" }])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
