import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StatsPeriodFilter from "./StatsPeriodFilter";
import { ALL_TIME, type StatsPeriod } from "../utils/season";

describe("StatsPeriodFilter", () => {
  it("renders nothing until the player has a season of results", () => {
    const { container } = render(
      <StatsPeriodFilter seasons={[]} value={ALL_TIME} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers only the seasons the player has results in", () => {
    render(<StatsPeriodFilter seasons={[2026, 2025]} value={ALL_TIME} onChange={vi.fn()} />);
    expect(screen.getByText("All time")).toBeInTheDocument();
    expect(screen.getByText("2026/27")).toBeInTheDocument();
    expect(screen.getByText("2025/26")).toBeInTheDocument();
    expect(screen.queryByText("2024/25")).not.toBeInTheDocument();
  });

  it("hides the quarters until a season is picked", async () => {
    const onChange = vi.fn();
    render(<StatsPeriodFilter seasons={[2026]} value={ALL_TIME} onChange={onChange} />);
    expect(screen.queryByText(/Q1/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("2026/27"));
    expect(onChange).toHaveBeenCalledWith({ seasonStartYear: 2026, quarter: null });
  });

  it("shows all four quarters with their months for the selected season", () => {
    const value: StatsPeriod = { seasonStartYear: 2026, quarter: null };
    render(<StatsPeriodFilter seasons={[2026]} value={value} onChange={vi.fn()} />);
    expect(screen.getByText("Q1 · Sep–Nov")).toBeInTheDocument();
    expect(screen.getByText("Q2 · Dec–Feb")).toBeInTheDocument();
    expect(screen.getByText("Q3 · Mar–May")).toBeInTheDocument();
    expect(screen.getByText("Q4 · Jun–Aug")).toBeInTheDocument();
  });

  it("narrows to a quarter without changing the season", async () => {
    const onChange = vi.fn();
    const value: StatsPeriod = { seasonStartYear: 2026, quarter: null };
    render(<StatsPeriodFilter seasons={[2026]} value={value} onChange={onChange} />);

    await userEvent.click(screen.getByText("Q3 · Mar–May"));
    expect(onChange).toHaveBeenCalledWith({ seasonStartYear: 2026, quarter: 3 });
  });

  it("drops the quarter when switching season", async () => {
    const onChange = vi.fn();
    const value: StatsPeriod = { seasonStartYear: 2026, quarter: 3 };
    render(<StatsPeriodFilter seasons={[2026, 2025]} value={value} onChange={onChange} />);

    await userEvent.click(screen.getByText("2025/26"));
    expect(onChange).toHaveBeenCalledWith({ seasonStartYear: 2025, quarter: null });
  });
});
