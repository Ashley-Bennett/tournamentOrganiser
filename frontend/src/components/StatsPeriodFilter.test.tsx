import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StatsPeriodFilter from "./StatsPeriodFilter";
import { ALL_TIME, type StatsPeriod } from "../utils/statsPeriod";

describe("StatsPeriodFilter", () => {
  it("renders nothing until the player has a year of results", () => {
    const { container } = render(
      <StatsPeriodFilter years={[]} value={ALL_TIME} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers only the years the player has results in", () => {
    render(<StatsPeriodFilter years={[2026, 2025]} value={ALL_TIME} onChange={vi.fn()} />);
    expect(screen.getByText("All time")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.queryByText("2024")).not.toBeInTheDocument();
  });

  // The season model this replaced labelled years as "2026/27" and hung four
  // quarters off each one. Both are gone: a year is just a year.
  it("shows plain years with no quarters", () => {
    const value: StatsPeriod = { year: 2026 };
    render(<StatsPeriodFilter years={[2026]} value={value} onChange={vi.fn()} />);

    expect(screen.queryByText(/Q[1-4]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026\/27/)).not.toBeInTheDocument();
  });

  it("reports the year the player picks", async () => {
    const onChange = vi.fn();
    render(<StatsPeriodFilter years={[2026, 2025]} value={ALL_TIME} onChange={onChange} />);

    await userEvent.click(screen.getByText("2025"));
    expect(onChange).toHaveBeenCalledWith({ year: 2025 });
  });

  it("goes back to all time", async () => {
    const onChange = vi.fn();
    const value: StatsPeriod = { year: 2026 };
    render(<StatsPeriodFilter years={[2026]} value={value} onChange={onChange} />);

    await userEvent.click(screen.getByText("All time"));
    expect(onChange).toHaveBeenCalledWith({ year: null });
  });
});
