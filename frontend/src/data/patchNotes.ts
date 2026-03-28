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
    version: "0.4.0",
    date: "2026-03-28",
    entries: [
      {
        category: "New Features",
        items: [
          "Player self-registration — players can join a tournament by entering a Pokémon room code or opening a shareable link. No account required.",
          "Player result submission — players can now submit their own match results from the player view. The first report auto-applies the result; the organiser can always confirm or override.",
          "My Tournaments page — all tournaments you've joined from your device are listed in one place at /my-tournaments, with live status.",
          "Organiser announcements — add a note to any round and it appears as an announcement on the public pairings page for all players to see.",
          "Pokémon deck support — players can pick a Pokémon to represent their deck. Their sprite shows up in standings and pairings so everyone can see what's in the room.",
          "Timer quick-adjust buttons — +/-1m and +/-10m buttons added to the timer editor for faster adjustments.",
          "You can now add or edit the round timer after a tournament has already been created.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "The pairings page automatically switches to the new round tab when a round starts, and to standings when the final round ends.",
          "Dropped players are now sorted to the bottom of standings.",
          "Pairings on the player view update in real-time as match results come in — no refresh needed.",
          "The matches view opens on the current round by default instead of round 1.",
          "Self-registration is always enabled for draft tournaments — no separate toggle needed.",
          "Joining via self-registration now automatically takes you to your player view.",
          "The tournament details panel has been refreshed with a cleaner look.",
          "Removed the suggested rounds field and bye warning to simplify tournament setup.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Result chips now update correctly when a result is undone and resubmitted.",
          "Deck sprites now display correctly in pairings and standings.",
          "Deleted tournaments no longer appear in the device tournament list.",
          "The player list no longer scrolls back to the top during background updates.",
          "Fixed an issue that could prevent tournament data from loading.",
        ],
      },
    ],
  },
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
