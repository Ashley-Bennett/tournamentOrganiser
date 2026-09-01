import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../supabaseClient", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("../AuthContext", () => ({
  useAuth: () => ({ profile: null }),
}));

// The deck picker is a big async component with its own tests. Here it only
// needs to be able to report a chosen deck.
vi.mock("../components/DeckPicker", () => ({
  default: ({ onChange }: { onChange: (a: number | null, b: number | null) => void }) => (
    <button onClick={() => onChange(1, null)}>choose deck</button>
  ),
}));

import { supabase } from "../supabaseClient";
import TournamentJoin from "./TournamentJoin";

const TOURNAMENT_ID = "t-1";

const joinPageRow = {
  tournament_name: "Thursday Locals",
  status: "draft",
  join_enabled: true,
  registered_names: ["David Smith"],
  allow_late_join: false,
  current_round: 1,
  round_in_progress: false,
  starts_at: null,
  game_format: null,
  location: null,
  description: null,
  // These tests cover a Pokémon event, where a deck is required to join.
  game_id: "pokemon",
};

/** Routes each RPC to a canned reply; self_join answers differently per call. */
function mockRpc(selfJoinReplies: unknown[], row: Record<string, unknown> = joinPageRow) {
  let selfJoinCall = 0;
  vi.mocked(supabase.rpc).mockImplementation(((name: string) => {
    if (name === "get_tournament_for_join") {
      return Promise.resolve({ data: [row], error: null });
    }
    if (name === "self_join_tournament") {
      return Promise.resolve({
        data: [selfJoinReplies[selfJoinCall++]],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }) as never);
}

const DUPLICATE_REPLY = {
  player_id: null,
  device_token: null,
  tournament_name: "Thursday Locals",
  duplicate_of: "David Smith",
};

const JOINED_REPLY = {
  player_id: "p-9",
  device_token: "t".repeat(64),
  tournament_name: "Thursday Locals",
  duplicate_of: null,
};

function renderJoinPage() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/join`]}>
      <Routes>
        <Route path="/t/:tournamentId/join" element={<TournamentJoin />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Fill the form and submit it. */
async function submitAs(user: ReturnType<typeof userEvent.setup>, name: string) {
  const field = await screen.findByLabelText("Your name");
  await user.clear(field);
  await user.type(field, name);
  await user.click(screen.getByRole("button", { name: "choose deck" }));
  await user.click(screen.getByRole("button", { name: "Join Tournament" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // A saved entry lives in localStorage AND a cookie; leaving either behind
  // sends the next test straight to the player view.
  localStorage.clear();
  for (const c of document.cookie.split("; ")) {
    document.cookie = `${c.split("=")[0]}=; max-age=0; path=/`;
  }
});

describe("TournamentJoin — an entry the organiser already made", () => {
  it("asks whether the organiser signed them up instead of joining", async () => {
    const user = userEvent.setup();
    mockRpc([DUPLICATE_REPLY]);
    renderJoinPage();

    await submitAs(user, "Dave");

    expect(
      await screen.findByText("Has the organiser already signed you up?"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, I am David Smith" })).toBeTruthy();
  });

  it("creates nothing when the player says that entry is them", async () => {
    const user = userEvent.setup();
    mockRpc([DUPLICATE_REPLY]);
    renderJoinPage();

    await submitAs(user, "Dave");
    await user.click(
      await screen.findByRole("button", { name: "Yes, I am David Smith" }),
    );

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("request_player_entry_link", {
        p_tournament_id: TOURNAMENT_ID,
        p_entry_name: "David Smith",
      }),
    );
    expect(await screen.findByText("You are already signed up")).toBeTruthy();
    // Only the first, unconfirmed attempt was ever made.
    const joinCalls = vi
      .mocked(supabase.rpc)
      .mock.calls.filter(([name]) => name === "self_join_tournament");
    expect(joinCalls).toHaveLength(1);
  });

  it("joins them for real when they say it is someone else", async () => {
    const user = userEvent.setup();
    mockRpc([DUPLICATE_REPLY, JOINED_REPLY]);
    renderJoinPage();

    await submitAs(user, "Dave");
    await user.click(
      await screen.findByRole("button", { name: "No, that is someone else" }),
    );

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith(
        "self_join_tournament",
        expect.objectContaining({ p_confirmed_distinct: true }),
      ),
    );
  });

  it("lets a name that is already registered be submitted, so the server can ask", async () => {
    const user = userEvent.setup();
    mockRpc([DUPLICATE_REPLY]);
    renderJoinPage();

    const field = await screen.findByLabelText("Your name");
    await user.clear(field);
    await user.type(field, "David Smith");
    await user.click(screen.getByRole("button", { name: "choose deck" }));

    expect(
      screen.getByRole("button", { name: "Join Tournament" }),
    ).not.toHaveProperty("disabled", true);
  });
});

// ---------------------------------------------------------------------------
// Generic tournaments have no decks at all
// ---------------------------------------------------------------------------

describe("TournamentJoin — a generic tournament", () => {
  const genericRow = { ...joinPageRow, game_id: "generic" };

  it("asks for nothing but a name", async () => {
    mockRpc([JOINED_REPLY], genericRow);
    renderJoinPage();

    await screen.findByLabelText("Your name");
    expect(screen.queryByText(/choose your deck/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "choose deck" })).not.toBeInTheDocument();
  });

  // The deck was previously required to join, which would have made a generic
  // tournament impossible to enter.
  it("can be joined without picking a deck", async () => {
    const user = userEvent.setup();
    mockRpc([JOINED_REPLY], genericRow);
    renderJoinPage();

    const field = await screen.findByLabelText("Your name");
    await user.clear(field);
    await user.type(field, "Dana");

    const join = screen.getByRole("button", { name: "Join Tournament" });
    expect(join).toBeEnabled();

    await user.click(join);
    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith(
        "self_join_tournament",
        expect.objectContaining({ p_player_name: "Dana", p_pokemon1: null }),
      ),
    );
  });
});
