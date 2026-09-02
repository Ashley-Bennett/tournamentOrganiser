import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { relativeTime } from "../utils/relativeTime";
import {
  addNotification,
  getNotifications,
  type NewNotification,
} from "../utils/notificationStore";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const event = (overrides: Partial<NewNotification> = {}): NewNotification => ({
  type: "round_published",
  tournamentId: "t1",
  tournamentName: "Thursday Locals",
  message: "Round 2 is up. Table 3 vs Marcus",
  href: "/t/t1/me",
  roundNumber: 2,
  ...overrides,
});

function renderBell(props: { showWhenEmpty?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <NotificationBell {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  document.title = "Matchamp";
});

describe("relativeTime", () => {
  const t = Date.UTC(2026, 0, 1, 12, 0, 0);
  const at = (msAgo: number) => new Date(t - msAgo).toISOString();

  it("reads as just now under a minute", () => {
    expect(relativeTime(at(30_000), t)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime(at(12 * 60_000), t)).toBe("12m ago");
    expect(relativeTime(at(3 * 3_600_000), t)).toBe("3h ago");
    expect(relativeTime(at(2 * 86_400_000), t)).toBe("2d ago");
  });
});

describe("when there is nothing to show", () => {
  // An anonymous visitor on the landing page has no notifications and no
  // reason to see a bell.
  it("renders nothing for an anonymous device with an empty store", () => {
    renderBell();
    expect(screen.queryByRole("button", { name: /notifications/i })).toBeNull();
  });

  it("still renders for a signed-in user, and opens to an empty state", async () => {
    renderBell({ showWhenEmpty: true });
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  // The device-token player is the majority case and is never "signed in".
  it("renders for an anonymous device once it has an event", () => {
    addNotification(event());
    renderBell();
    expect(
      screen.getByRole("button", { name: /notifications/i }),
    ).toBeInTheDocument();
  });
});

describe("unread count", () => {
  it("labels the bell with the unread count", () => {
    addNotification(event({ roundNumber: 1 }));
    addNotification(event({ roundNumber: 2 }));
    renderBell();
    expect(
      screen.getByRole("button", { name: "Notifications, 2 unread" }),
    ).toBeInTheDocument();
  });

  it("caps the badge label at 9+", () => {
    for (let i = 0; i < 12; i++) addNotification(event({ roundNumber: i }));
    renderBell();
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("carries the count in the tab title", async () => {
    addNotification(event());
    renderBell();
    await waitFor(() => expect(document.title).toBe("(1) Matchamp"));
  });

  it("restores the title once nothing is unread", async () => {
    addNotification(event());
    renderBell();
    await waitFor(() => expect(document.title).toBe("(1) Matchamp"));

    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => expect(document.title).toBe("Matchamp"));
  });
});

describe("the panel", () => {
  it("lists events with their tournament", async () => {
    addNotification(event());
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(
      screen.getByText("Round 2 is up. Table 3 vs Marcus"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Thursday Locals/)).toBeInTheDocument();
  });

  // Two events at once must never be confused for one another.
  it("names the tournament on every row when there are two", async () => {
    addNotification(event({ tournamentId: "t1", tournamentName: "Thursday Locals" }));
    addNotification(event({ tournamentId: "t2", tournamentName: "Sunday Cup" }));
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByText(/Thursday Locals/)).toBeInTheDocument();
    expect(screen.getByText(/Sunday Cup/)).toBeInTheDocument();
  });

  it("navigates to the deep link and marks that row read", async () => {
    const stored = addNotification(event());
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await userEvent.click(screen.getByText("Round 2 is up. Table 3 vs Marcus"));

    expect(navigate).toHaveBeenCalledWith("/t/t1/me");
    expect(getNotifications().find((n) => n.id === stored!.id)?.readAt).not.toBeNull();
  });

  // Glancing at the list must not silently clear things the player hasn't read.
  it("does not mark anything read just by opening", async () => {
    addNotification(event());
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(getNotifications()[0]?.readAt).toBeNull();
  });

  it("marks everything read on request", async () => {
    addNotification(event({ roundNumber: 1 }));
    addNotification(event({ roundNumber: 2 }));
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    expect(getNotifications().every((n) => n.readAt !== null)).toBe(true);
  });

  it("shows newest first", async () => {
    // Must be inside the 30-day window, or the store prunes them before render.
    const t0 = Date.now() - 120_000;
    addNotification(event({ roundNumber: 1, message: "older" }), t0);
    addNotification(event({ roundNumber: 2, message: "newer" }), t0 + 60_000);
    renderBell();
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const rows = screen.getAllByRole("button", { name: /older|newer/ });
    expect(rows[0]).toHaveTextContent("newer");
  });
});

describe("live updates", () => {
  it("picks up an event raised while the bell is mounted", async () => {
    renderBell({ showWhenEmpty: true });
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();

    addNotification(event());

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications, 1 unread" }),
      ).toBeInTheDocument(),
    );
  });
});
