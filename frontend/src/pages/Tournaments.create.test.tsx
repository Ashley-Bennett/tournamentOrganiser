/**
 * The create-tournament dialog: choosing a game, and what that choice stores.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const insertedRows: Record<string, unknown>[] = [];
const navigateSpy = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "new-t" }, error: null }),
          }),
        };
      },
    }),
  },
}));

// Stable identities: Tournaments memoises its fetch on `user`/`logout`, so a
// fresh object from either hook on every render would re-run the effect for
// ever and the test would hang rather than fail.
const AUTH = { user: { id: "u-1" }, logout: () => {} };
const WORKSPACE = { workspaceId: "w-1", wPath: (path: string) => path };

vi.mock("../AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("../WorkspaceContext", () => ({ useWorkspace: () => WORKSPACE }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateSpy };
});

import Tournaments from "./Tournaments";

async function openCreateDialog() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Tournaments />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: /create tournament/i }));
  return user;
}

function dialog() {
  return screen.getByRole("dialog");
}

beforeEach(() => {
  insertedRows.length = 0;
  navigateSpy.mockClear();
});

describe("create tournament — choosing a game", () => {
  it("cannot be submitted until a game is chosen", async () => {
    const user = await openCreateDialog();
    await user.type(screen.getByLabelText(/tournament name/i), "Thursday Locals");

    const create = within(dialog()).getByRole("button", { name: /^create$/i });
    expect(create).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Pokémon TCG" }));
    expect(create).toBeEnabled();
  });

  it("shows the games that are not built yet, but will not select them", async () => {
    const user = await openCreateDialog();
    const magic = screen.getByRole("radio", { name: /Magic: The Gathering \(coming soon\)/i });

    await user.click(magic);

    expect(magic).toHaveAttribute("aria-checked", "false");
    // Tapping explains itself in text — a tooltip would never fire on touch.
    expect(screen.getByText(/coming after 1\.0/i)).toBeInTheDocument();
  });

  it("asks for a format for Pokémon", async () => {
    const user = await openCreateDialog();
    await user.click(screen.getByRole("radio", { name: "Pokémon TCG" }));

    expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
    expect(within(dialog()).getByText("Standard")).toBeInTheDocument();
  });

  it("asks nothing about format for a generic tournament", async () => {
    const user = await openCreateDialog();
    await user.click(screen.getByRole("radio", { name: "Generic tournament" }));

    expect(screen.queryByLabelText(/format/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/structure/i)).toBeInTheDocument();
  });

  it("does not offer a structure the app cannot run yet", async () => {
    const user = await openCreateDialog();
    await user.click(screen.getByRole("radio", { name: "Generic tournament" }));
    await user.click(screen.getByLabelText(/structure/i));

    const roundRobin = screen.getByRole("option", { name: /round robin/i });
    expect(roundRobin).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: /swiss/i })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("create tournament — what gets stored", () => {
  it("records the game, its default format and Swiss for Pokémon", async () => {
    const user = await openCreateDialog();
    await user.type(screen.getByLabelText(/tournament name/i), "Thursday Locals");
    await user.click(screen.getByRole("radio", { name: "Pokémon TCG" }));
    await user.click(within(dialog()).getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(insertedRows).toHaveLength(1));
    expect(insertedRows[0]).toMatchObject({
      name: "Thursday Locals",
      game_id: "pokemon",
      game_format: "standard",
      tournament_type: "swiss",
      status: "draft",
    });
  });

  it("stores the chosen format rather than the default", async () => {
    const user = await openCreateDialog();
    await user.type(screen.getByLabelText(/tournament name/i), "GLC Night");
    await user.click(screen.getByRole("radio", { name: "Pokémon TCG" }));
    await user.click(screen.getByLabelText(/format/i));
    await user.click(screen.getByRole("option", { name: /gym leader challenge/i }));
    await user.click(within(dialog()).getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(insertedRows).toHaveLength(1));
    expect(insertedRows[0]).toMatchObject({ game_format: "glc" });
  });

  // A generic event is not a specific game, so it must not carry a format.
  it("stores no format for a generic tournament", async () => {
    const user = await openCreateDialog();
    await user.type(screen.getByLabelText(/tournament name/i), "Board Game Night");
    await user.click(screen.getByRole("radio", { name: "Generic tournament" }));
    await user.click(within(dialog()).getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(insertedRows).toHaveLength(1));
    expect(insertedRows[0]).toMatchObject({
      game_id: "generic",
      game_format: null,
      tournament_type: "swiss",
    });
  });

  it("opens the new tournament once it is created", async () => {
    const user = await openCreateDialog();
    await user.type(screen.getByLabelText(/tournament name/i), "Thursday Locals");
    await user.click(screen.getByRole("radio", { name: "Generic tournament" }));
    await user.click(within(dialog()).getByRole("button", { name: /^create$/i }));

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/tournaments/new-t", {
        state: { new: true },
      }),
    );
  });

  it("starts blank again after a create, rather than remembering the last game", async () => {
    const user = await openCreateDialog();
    await user.type(screen.getByLabelText(/tournament name/i), "Thursday Locals");
    await user.click(screen.getByRole("radio", { name: "Pokémon TCG" }));
    await user.click(within(dialog()).getByRole("button", { name: /^create$/i }));

    // Wait for the dialog to actually close, not just for the insert to be
    // issued: while it is open MUI marks the page behind it aria-hidden, so
    // the list's own button is not reachable yet.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /create tournament/i }));

    expect(screen.getByRole("radio", { name: "Pokémon TCG" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByLabelText(/tournament name/i)).toHaveValue("");
  });
});
