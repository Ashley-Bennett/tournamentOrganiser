import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mock Supabase — intercept the client before it makes any network calls
// ---------------------------------------------------------------------------

vi.mock("../supabaseClient", () => ({
  supabase: { rpc: vi.fn() },
}));

// Import after mock so we get the mocked version
import { supabase } from "../supabaseClient";
import PlayerClaimLinkDialog from "./PlayerClaimLinkDialog";

const PLAYER_ID = "player-abc";
const TOKEN = "a".repeat(64);

function renderDialog(open = true) {
  return render(
    <PlayerClaimLinkDialog
      open={open}
      playerId={PLAYER_ID}
      playerName="Tom Snow"
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlayerClaimLinkDialog", () => {
  it("mints a claim link for the player and shows the claim URL", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ token: TOKEN, claim_id: "claim-1" }],
      error: null,
    } as never);

    renderDialog();

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith("create_player_claim_link", {
        p_tournament_player_id: PLAYER_ID,
      }),
    );

    const field = await screen.findByDisplayValue(
      `${window.location.origin}/claim/${TOKEN}`,
    );
    expect(field).toBeTruthy();
  });

  it("names the player being linked", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ token: TOKEN, claim_id: "claim-1" }],
      error: null,
    } as never);

    renderDialog();

    expect(
      await screen.findByText(/Link Tom Snow to an account/i),
    ).toBeTruthy();
  });

  it("copies the claim URL to the clipboard", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ token: TOKEN, claim_id: "claim-1" }],
      error: null,
    } as never);

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog();

    const copyButton = await screen.findByLabelText("Copy claim link");
    await userEvent.click(copyButton);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/claim/${TOKEN}`,
      ),
    );
  });

  it("surfaces the server error when minting is refused", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "Only workspace owners and admins can create claim links" },
    } as never);

    renderDialog();

    expect(
      await screen.findByText(/Only workspace owners and admins/i),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Copy claim link")).toBeNull();
  });

  it("does not mint a link while closed", () => {
    renderDialog(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
