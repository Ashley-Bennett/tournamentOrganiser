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
    version: "0.7.0",
    date: "2026-09-02",
    entries: [
      {
        category: "New Features",
        items: [
          "More than one game: when you create a tournament you now pick which game it is for. Pokemon works as it always has, and Generic covers any other game. More TCGs are on the way.",
          "New stats page for organisers: see how many different people play with you, how attendance is going, a running league table, what decks people are bringing, and how your events are running.",
          "Deck diversity: see whether your meta is opening up or narrowing down over time, and how big a share the most popular deck has.",
          "Game pace: your stats now show your fastest and longest games, and organisers can see typical game length and how much of the round clock it uses.",
          "Fix mixed-up players: spot people who have been entered twice under slightly different names, merge them into one person, or split entries back out. Everything can be undone.",
          "Late joins: turn on \"Allow late joins\" and the join link keeps working after a tournament has started. Latecomers take a loss for the rounds they missed and get paired into the current round.",
          "Players can now be linked to an account, so they see their pairings and report results on any device without the original join link.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "Adding a player now suggests people who have played with you before, along with how many events they have played. Picking someone links their account straight away.",
          "You can link an existing player to an account yourself, and send them a one-time link or QR code to claim it.",
          "You can now take a player out of a single round without removing them from the tournament.",
          "The player list has a Deck column with artwork and an edit button, so you can set someone's deck for them.",
          "Generic tournaments skip the Pokemon-only bits: no deck needed to join, neutral room codes, and standings that rank by the rules the event is run under.",
          "Someone who has already been added by the organiser can no longer sign themselves up a second time.",
          "Late entries no longer get a free win. A player who joins mid-round and cannot be paired sits that round out instead of being awarded a bye, and anyone whose bye was taken is told.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Stats are now shown one game at a time, on both your stats page and your dashboard, so different games no longer get mixed together.",
          "You can filter your stats by year, or view everything.",
          "Every stats table can be sorted by any column, exported to CSV, and long tables scroll in place instead of stretching the page sideways.",
          "Stats sections fold away and remember what you left open, and only load once you open them.",
          "Picking decks or events now opens a searchable dialog, full screen on the phone, instead of a long wall of chips.",
          "Top 3, Top 8 and 1st place rates are now counted out of the same number of events, so they can be compared, and a better finish counts towards the lower tiers too.",
          "Best finish now makes way for your 1st place rate once you have won an event.",
          "Stats no longer leave the previous game or period's numbers on screen while new ones load, and a section that fails to load now says so instead of pretending there is nothing to show.",
          "Picking the game or period you are already on no longer reloads the page.",
          "Plainer wording across the landing page, alerts, dialogs, empty states and error messages.",
        ],
      },
    ],
  },
  {
    version: "0.6.1",
    date: "2026-07-27",
    entries: [
      {
        category: "New Features",
        items: [
          "Push notifications: get alerted when a new round is paired, when the round timer runs out, and when final standings are ready, even when the app isn't open. Add the app to your home screen for the best experience.",
          "In-app alerts: whatever page you're on, you'll get a heads-up when your next round is ready, with a quick link straight to your table. It vibrates and flashes the tab too, so you don't miss it.",
          "Tournament details: organisers can add a date and time, game format, location, and notes to a tournament, and players see them before they join.",
        ],
      },
      {
        category: "Workspaces",
        items: [
          "New accounts now get a personal workspace set up automatically on first sign-in, so there's no create-workspace step to get through first.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "Final placings now show correctly. Tied players no longer collapse to the wrong spot, like 5th showing as 3rd.",
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
          "After a match you can now record whether you went first and what deck your opponent played. Both feed straight into your stats.",
          "Redesigned dashboard: a spotlight for your active tournament, your five most recent tournaments, quick stats, and a friendly time-of-day greeting.",
          "Your dashboard now shows meaningful stats at a glance: tournaments completed, wins, win rate, and your favourite deck.",
          "Switch between Organising and Playing with tabs on the home page, so the app shows what matters for how you're using it.",
          "You can now set whether you prefer the player or organiser view from your account page.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "You now pick your deck when you join a tournament, so your stats are captured from the very first round. Your deck stays hidden from opponents until the event ends.",
          "Standings tiebreakers now follow the official Play! Pokémon rules more closely. Byes are excluded from win percentage, and the rules for draws and dropped players now match the handbook.",
          "If an organiser removes you by mistake, you can now rejoin a tournament you'd self-registered for.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "When you sign in, tournaments you joined on this device are now linked to your account automatically, so there's nothing to claim by hand.",
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
          "The pairing decision log is now collapsible and shows each player's name when a rematch was unavoidable, which makes generated pairs much easier to audit.",
          "Duplicate names are now blocked when joining a tournament, with a clear error message.",
          "A retry button now appears when a round operation fails, so you don't have to refresh the whole page.",
          "If the app can't reach the server on startup, it now tells you clearly instead of silently failing.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Deleting a round, clearing results, and other destructive actions now ask for confirmation first.",
          "Copying text to clipboard now shows a confirmation toast so you know it worked.",
          "Empty screens across the app now have a button telling you what to do next.",
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
          "Standings tiebreakers now use Opponent Match Win % (OMW%) and Opponent's Opponent Match Win % (OOMW%), so players are ranked by the actual strength of who they played rather than at random.",
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
          "The join display screen now shows the join URL in a larger, cleaner format that's readable across the room.",
        ],
      },
      {
        category: "Fixes & Polish",
        items: [
          "Fixed a bug where both players agreeing on a result could auto-complete the match. Organiser confirmation is now always required.",
          "The organiser's matches view no longer scrolls back to the top when a result is entered or submitted.",
          "Standings table is less cramped when the deck column is shown.",
          "Faster page loads, thanks to better font handling and image optimisation.",
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
          "Players can join a tournament themselves by entering a Pokémon room code or opening a shareable link. No account required.",
          "Players can submit their own match results from the player view. The first report applies the result automatically, and the organiser can always confirm or override it.",
          "New My Tournaments page at /my-tournaments, listing everything you've joined from your device with live status.",
          "Organisers can add a note to any round, and it shows up as an announcement on the public pairings page for everyone to see.",
          "Players can pick a Pokémon to represent their deck. The sprite shows up in standings and pairings, so everyone can see what's in the room.",
          "The timer editor has +/-1m and +/-10m buttons for quicker adjustments.",
          "You can now add or edit the round timer after a tournament has already been created.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "The pairings page automatically switches to the new round tab when a round starts, and to standings when the final round ends.",
          "Dropped players are now sorted to the bottom of standings.",
          "Pairings on the player view update in real-time as match results come in, with no refresh needed.",
          "The matches view opens on the current round by default instead of round 1.",
          "Self-registration is always enabled for draft tournaments, so there's no separate toggle.",
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
          "Dark mode. Switch between light and dark using the toggle in the header, and your preference is saved across sessions.",
          "The header is now consistent across every page, so navigation and the theme toggle are always where you expect them.",
          "Matchamp now has a proper landing page. Share the link with someone who hasn't signed up and they'll see what it does, how it works, and a sign-up button.",
          "You can now pause and resume the round timer. A pause/play button appears next to the timer once a round begins, and the timer freezes for everyone, including the public pairings view, until you resume it.",
        ],
      },
      {
        category: "Tournaments",
        items: [
          "Edit Pairings now works on mobile. Tap to remove a player from their slot, then reassign them from a dropdown.",
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
          "Each round now shows a countdown timer to help keep your event on schedule.",
          "Players can be added to a tournament after it has already started.",
          "Players can claim their own entries and connect them to their account, so results follow them across tournaments.",
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
          "Plenty of other small fixes and tidy-ups.",
        ],
      },
    ],
  },
];

export default patchNotes;
