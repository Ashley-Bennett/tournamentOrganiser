import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import PlayerNameInput, { type PlayerNameSelection } from "./PlayerNameInput";
import type { WorkspacePlayer } from "../types/workspacePlayer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKnown(
  overrides: Partial<WorkspacePlayer> & { user_id: string },
): WorkspacePlayer {
  return {
    preferred_name: null,
    display_name: "Player",
    created_at: "2026-01-01T00:00:00Z",
    tournaments_played: 0,
    ...overrides,
  };
}

const TOM = makeKnown({
  user_id: "user-tom",
  display_name: "Tom Snow",
  tournaments_played: 7,
});
const ANA = makeKnown({
  user_id: "user-ana",
  preferred_name: "Ana",
  display_name: "Anastasia B",
  tournaments_played: 1,
});

/** Wrapper that holds selection state, mirroring how callers use the field. */
function Harness({
  knownPlayers = [TOM, ANA],
  excludeUserIds = [],
  onSelectionChange,
}: {
  knownPlayers?: WorkspacePlayer[];
  excludeUserIds?: string[];
  onSelectionChange?: (s: PlayerNameSelection) => void;
}) {
  const [selection, setSelection] = useState<PlayerNameSelection>({
    name: "",
    userId: null,
  });
  return (
    <PlayerNameInput
      value={selection}
      onChange={(s) => {
        setSelection(s);
        onSelectionChange?.(s);
      }}
      knownPlayers={knownPlayers}
      excludeUserIds={excludeUserIds}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlayerNameInput — known players", () => {
  it("suggests a workspace regular and attaches their account on selection", async () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.type(screen.getByRole("combobox"), "Tom");
    await userEvent.click(await screen.findByText("Tom Snow"));

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      name: "Tom Snow",
      userId: "user-tom",
    });
  });

  it("prefers the workspace nickname over the profile display name", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "Ana");

    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Anastasia B")).toBeNull();
  });

  it("shows how many tournaments a regular has played", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "Tom");

    expect(await screen.findByText("7 tournaments")).toBeTruthy();
  });

  it("hides regulars already in this tournament", async () => {
    render(<Harness excludeUserIds={["user-tom"]} />);
    await userEvent.type(screen.getByRole("combobox"), "Tom");

    expect(screen.queryByText("Tom Snow")).toBeNull();
  });
});

describe("PlayerNameInput — walk-ins", () => {
  it("keeps a freely typed name unlinked", async () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.type(screen.getByRole("combobox"), "Walk In");

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      name: "Walk In",
      userId: null,
    });
  });

  it("drops the linked account when the name is edited after picking", async () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);

    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Tom");
    await userEvent.click(await screen.findByText("Tom Snow"));
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      name: "Tom Snow",
      userId: "user-tom",
    });

    await userEvent.type(input, "my");

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      name: "Tom Snowmy",
      userId: null,
    });
  });

  it("behaves as a plain text field when the workspace has no regulars", async () => {
    const onSelectionChange = vi.fn();
    render(<Harness knownPlayers={[]} onSelectionChange={onSelectionChange} />);

    await userEvent.type(screen.getByRole("combobox"), "Solo");

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      name: "Solo",
      userId: null,
    });
  });
});
