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
    version: "0.6.1",
    date: "2026-07-27",
    entries: [
      {
        category: "New Features",
        items: [
          "Push notifications: get alerted when a new round is paired, when the round timer runs out, and when final standings are ready — even when the app isn't open. Add the app to your home screen for the best experience.",
          "In-app alerts: on any page, you'll now get a heads-up — with a quick link straight to your table — when your next round is ready, along with a vibrate and a flashing tab so you don't miss it.",
          "Tournament details: organisers can add a date and time, game format, location, and notes to a tournament, and players see them before they join.",
        ],
      },
      {
        category: "Workspaces",
        items: [
          "New accounts now get a personal workspace set up automatically on first sign-in — no more create-workspace step just to get going.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "Final placings now show correctly — tied players no longer collapse to the wrong spot (for example, 5th showing as 3rd).",
          "Entering a result on mobile now asks \"Who won?\" with buttons labelled by the actual player names, instead of abstract score chips.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "New breadcrumb navigation across the tournament pages, so your dashboard is one tap away from anywhere.",
          "Standings now read \"Standings\" while a tournament is in progress and \"Final Standings\" once it's done.",
          "When setting up a tournament, we now suggest a sensible round count for the number of players.",
          "The password-reset link no longer gets stuck on \"Verifying reset link…\".",
          "Joining with a Mega, regional, or Gigantamax Pokémon deck now works.",
          "Tournaments you join while signed in are linked to your account automatically, and an entry that belongs to someone else now says so clearly.",
          "A branded app icon plus nicer previews when you share a link to the app, and quick sign-up / log-in links between the auth pages.",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-07-26",
    entries: [
      {
        category: "New Features",
        items: [
          "New player stats page: see your overall record, a matchup matrix, deck history, round-by-round performance, and how you're trending over time.",
          "After a match you can now record whether you went first and what deck your opponent played — these feed straight into your stats.",
          "Redesigned dashboard: a spotlight for your active tournament, your five most recent tournaments, quick stats, and a friendly time-of-day greeting.",
          "Your dashboard now shows meaningful stats at a glance — tournaments completed, wins, win rate, and your favourite deck.",
          "Switch between Organising and Playing with tabs on the home page, so the app shows what matters for how you're using it.",
          "You can now set whether you prefer the player or organiser view from your account page.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "You now pick your deck when you join a tournament, so your stats are captured from the very first round. Your deck stays hidden from opponents until the event ends.",
          "Standings tiebreakers now follow the official Play! Pokémon rules more closely — byes are excluded from win percentage and the rules for draws and dropped players match the handbook.",
          "If an organiser removes you by mistake, you can now rejoin a tournament you'd self-registered for.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "When you sign in, tournaments you joined on this device are now linked to your account automatically — no manual claiming needed.",
          "Your name is pre-filled from your profile when joining a tournament.",
          "Win rate now counts byes as wins and shows one decimal place, matching the standings.",
          "Your current streak and deck filters on the stats page now calculate correctly.",
          "Dashboards no longer flash a loading spinner when you switch browser tabs and come back.",
          "Added a privacy policy, terms page, and the ability to delete your account and its data yourself.",
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-06-17",
    entries: [
      {
        category: "New Features",
        items: [
          "Pairings and player view pages now show a live indicator so everyone knows the page is actively tracking the tournament.",
          "You can now print or export round pairings and standings as a PDF directly from the tournament page.",
          "The pairing decision log is now collapsible and shows each player's name when a rematch was unavoidable — useful for auditing generated pairs.",
          "Duplicate names are now blocked when joining a tournament, with a clear error message.",
          "A retry button now appears when a round operation fails, so you don't have to refresh the whole page.",
          "If the app can't reach the server on startup, it now tells you clearly instead of silently failing.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Destructive actions — like deleting a round or clearing results — now ask for confirmation before proceeding.",
          "Copying text to clipboard now shows a confirmation toast so you know it worked.",
          "Empty states across the app now have helpful buttons so you know what to do next.",
          "Pairings and standings tables are easier to read on mobile.",
          "Switching tabs and coming back to the tournament no longer resets the page or flashes a loading spinner.",
          "Error messages now appear on the My Tournaments and Device Tournaments pages when something goes wrong.",
        ],
      },
    ],
  },
  {
    version: "0.4.3",
    date: "2026-05-31",
    entries: [
      {
        category: "Tournaments",
        items: [
          "Standings tiebreakers now use Opponent Match Win % (OMW%) and Opponent's Opponent Match Win % (OOMW%), so players are ranked by the actual strength of who they played — not randomly.",
          "Draws now correctly count as half a win when calculating tiebreakers, matching standard Pokémon TCG rules.",
          "Swiss pairings: fixed a bug where a floater player could be rematched against someone they'd already played, even when a fresh opponent was available.",
        ],
      },
    ],
  },
  {
    version: "0.4.2",
    date: "2026-04-06",
    entries: [
      {
        category: "New Features",
        items: [
          "Added a 'My Tournaments' link to the header so you can quickly jump to your tournaments without logging in.",
          "Added a burger menu for mobile navigation on the landing page and logged-out header.",
          "The join display screen now shows the join URL in a larger, cleaner format — easier to read across the room.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Fixed a bug where both players agreeing on a result could auto-complete the match — organiser confirmation is now always required.",
          "The organiser's matches view no longer scrolls back to the top when a result is entered or submitted.",
          "Standings table is less cramped when the deck column is shown.",
          "Performance improvements — faster page loads with better font handling and image optimisation.",
        ],
      },
    ],
  },
  {
    version: "0.4.1",
    date: "2026-03-28",
    entries: [
      {
        category: "Fixes & Polish",
        items: [
          "Removed the public tournament toggle from tournament setup.",
          "Improved the mobile experience for entering match results and viewing standings.",
          "Removed the 'known players' shortcut button to simplify the add-player flow.",
          "Pairings now open in a new tab so you don't lose your place.",
          "Fixed light mode display on the landing page.",
          "Polished the header and landing page navigation.",
          "Fixed various tournament flow and timer issues.",
        ],
      },
    ],
  },
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
