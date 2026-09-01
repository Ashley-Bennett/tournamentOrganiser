import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatsGameFilter from "./StatsGameFilter";

describe("StatsGameFilter", () => {
  // A player who has only ever played one game should see the page exactly as
  // it was before games existed — no picker, no decision to make.
  it("renders nothing for a player with a single game", () => {
    const { container } = render(
      <StatsGameFilter gameIds={["pokemon"]} value="pokemon" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a player with no results at all", () => {
    const { container } = render(
      <StatsGameFilter gameIds={[]} value={null} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers each game once the player has more than one", () => {
    render(
      <StatsGameFilter
        gameIds={["pokemon", "generic"]}
        value="pokemon"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Pokémon")).toBeInTheDocument();
    expect(screen.getByText("Generic")).toBeInTheDocument();
  });

  it("reports the game the player picks", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StatsGameFilter
        gameIds={["pokemon", "generic"]}
        value="pokemon"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText("Generic"));

    expect(onChange).toHaveBeenCalledWith("generic");
  });
});
