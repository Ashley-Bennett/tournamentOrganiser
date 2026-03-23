export interface PatchNote {
  version: string;
  date: string;
  entries: {
    category: string;
    items: string[];
  }[];
}

const patchNotes: PatchNote[] = [
  {
    version: "0.3.0",
    date: "2026-03-23",
    entries: [
      {
        category: "New Features",
        items: [
          "Dark mode is here. Switch between light and dark using the toggle in the header — your preference is saved across sessions.",
          "The header is now consistent across every page, so navigation and the theme toggle are always where you expect them.",
          "Matchamp now has a proper landing page. If you share the link with someone who hasn't signed up, they'll see a full overview of what Matchamp does, how it works, and a sign-up button.",
          "You can now pause and resume the round timer. A pause/play button appears next to the timer once a round begins — the timer freezes for everyone including the public pairings view until you resume it.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "Edit Pairings now works on mobile — tap to remove a player from their slot and reassign them using a dropdown.",
          "Swiss pairings no longer create rematches when the bye can go elsewhere.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-03-09",
    entries: [
      {
        category: "New Features",
        items: [
          "Round timer — each round now displays a countdown timer to help keep your event on schedule.",
          "Late entries — players can be added to a tournament after it has already started.",
          "Player account linking — players can now claim their own player entries and connect them to their account to track results across tournaments.",
          "Forgot password and reset password flows are now available from the login screen.",
        ],
      },
      {
        category: "Workspaces",
        items: [
          "Invite members to your workspace via a shareable invite link.",
          "Delete a workspace from Workspace Settings.",
          "Switch between workspaces directly from the header.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "Round configuration can now be changed after a tournament has started.",
          "Match results and pairings update instantly without needing to refresh.",
          "Improved standings and results view.",
          "Pairing notes now show clearer feedback.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Fixed a bug with static seating input.",
          "Improved mobile layout across auth screens.",
          "Various small fixes and UX improvements throughout the app.",
        ],
      },
    ],
  },
];

export default patchNotes;
