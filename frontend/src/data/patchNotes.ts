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
    version: "0.2.4",
    date: "2026-03-10",
    entries: [
      {
        category: "Tournaments",
        items: [
          "You can now pause and resume the round timer. A pause/play button appears next to the timer once a round begins — useful if you accidentally started the clock too early. The timer freezes for everyone (including the public pairings view) until you resume it.",
        ],
      },
    ],
  },
  {
    version: "0.2.3",
    date: "2026-03-10",
    entries: [
      {
        category: "Fixes & Polish",
        items: [
          "Swiss pairings no longer create rematches when the bye can go elsewhere. Previously, giving the bye to the lowest-score player could strand two players who had already faced each other with no choice but to rematch. The algorithm now checks whether that would happen and gives the bye to a higher-score player instead.",
        ],
      },
    ],
  },
  {
    version: "0.2.2",
    date: "2026-03-10",
    entries: [
      {
        category: "Fixes & Polish",
        items: [
          "Edit Pairings now works on mobile — you can tap to remove a player from their slot and reassign them using a dropdown, just like on desktop.",
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
