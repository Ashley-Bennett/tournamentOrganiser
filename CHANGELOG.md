# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.7.0] - 2026-09-02

### Added
- **Multi-game tournaments.** Tournaments now carry a `game_id` and a rules profile. A new games registry (`frontend/src/games/`: `registry.ts`, `rules.ts`, `types.ts`) declares each game's formats, deck handling, season start month and scoring rules. Existing tournaments are backfilled to Pokemon. Create-tournament asks which game the event is for (Pokemon and Generic selectable, other TCGs marked coming soon); Pokemon events pick a format from a code list, generic events skip the step. Round robin added as an allowed structure (shown but not yet selectable).
- **Game-neutral behaviour for non-Pokemon events.** Join/room codes use neutral words instead of Pokemon names, joining needs only a name, deck columns and per-game scores are hidden, and standings rank by the profile's rules — Buchholz instead of OMW/OOMW. Results record the winner rather than a game score that was never entered.
- **Organiser stats page** (`/w/:slug/stats`, `OrganiserStats.tsx`) with unique players, attendance timeline, running league table, deck meta share, event health and deck diversity. Accountless players are matched by name within the workspace so regulars count once across events. League table = match points + placement points over the last 6 weeks or a hand-picked event set, showing byes and ranking by league position. Meta share hides one-off decks by default, searches by name, and drills into a deck's pilots and events (`DeckDetailModal`). Event health reports round length, drops by round and self-reported result share.
- **Deck diversity trend**: concentration-based effective deck count alongside registered deck count, top-deck share per period, and a flag when the meta is genuinely concentrating or opening up (`DeckDiversitySection`).
- **Round and game timing capture.** Rounds persist start/end/pause timestamps and matches record when a result was first entered, replacing the old round timing that could never populate. Player stats gain a Game Pace section (fastest/longest games with event, deck and opponent); organiser round health shows typical game length, clock usage and a per-player pace table (`PlayerPaceSection`, `utils/timing.ts`).
- **Player identity merge/split.** Suggests likely duplicates by name similarity, merges (keeping the entry-richer player, direction swappable, confirmed via `MergeConfirmDialog`), splits entries onto their own person, and persists "not the same" dismissals. All corrections are undoable and owner/admin only (`PlayerIdentityDialog`, `MergeSuggestions`).
- **Per-game, per-period stats.** Player and organiser stats take a game filter (hidden until you have played more than one game) and a period filter of all time or a calendar year. Deck history and matchup matrix are hidden for games without decks. The playing dashboard shows one game at a time to match.
- **Shared stats UI primitives**: `PickerDialog` (one searchable, mobile-full-screen dialog behind both the deck and event pickers), `StatsSection` (collapsible, remembers open state, lazy-loads its data, shows a collapsed summary), `StatsTable` (sort by any column, in-place scroll with sticky header past 10 rows, CSV export of every row), `StatsTimeline` (month/quarter/year grouping, shared by both stats pages), plus `EventPicker`, `GamePicker`, `StatsDeckFilter`, `useStatsRpc` and `utils/csv.ts`.
- **Account identity as a player credential.** `assert_player_access` now accepts either a device token or the signed-in account, so a linked player can open their tournament on any device. Organiser-added players can be linked to an account and get pairings, result reporting, deck selection and notifications; anonymous players are unaffected.
- **Organiser player linking**: new Account column in the player list with a Link button that mints a single-use claim link plus QR code (`PlayerClaimLinkDialog`).
- **Known-players picker** (`PlayerNameInput`, `useWorkspacePlayers`, `types/workspacePlayer.ts`): the name field suggests workspace regulars with their event counts, and adding someone that way links their account immediately. Works for late entries too; free-text names still work for walk-ins.
- **Late joins.** New "Allow late joins" toggle keeps the join link/QR live once a tournament is under way. Late joiners take a loss for rounds already played and are slotted into the current round; organisers are notified when someone self-adds. Late-entry pairing moved server-side (`utils/lateEntry.ts` + RPC) so organiser-added and self-added entries behave identically, replacing two divergent client copies.
- Organiser can remove a player from a single round.
- Deck column on the tournament player list with sprites and an edit button, so organiser-added players can get a deck without self-registering; the deck picker dialog names the player being edited.

### Fixed
- **Late entries no longer get a free win.** A player who joins mid-round and cannot be paired now sits the round out as a loss instead of being awarded a 3-point bye; players whose bye is taken by a late entry are notified, and the join page and late-entry dialog no longer promise a bye that will not happen.
- **Placement rates share a denominator and nest.** Top 3, Top 8 and 1st place rates are all out of the same event count, a stronger finish counts toward the weaker tiers (so top 3 can no longer exceed top 8), and each card names the events it is out of.
- Best finish and 1st place rate now share a card: best finish while it can still move, the win rate once a win is earned.
- **Stale and silently-failed stats.** Out-of-order responses could leave the previous game/period's numbers on screen; a section that failed to load reported "no events in this period yet" instead of an error; a failed possible-duplicate lookup hid the whole banner. All three now surface correctly.
- Re-picking the already-selected game or period no longer triggers a refetch (`StatsGameFilter`, `StatsPeriodFilter`, both stats pages).
- Event selection moved from a wall of chips into a searchable dialog with a checkbox list, full-screen on mobile, applying on Done so the table no longer refetches on every tick while a selection is being built. The page keeps a one-line summary with quick-remove chips.
- Wide stats tables stretched the page sideways instead of scrolling in place; timeline labels could sit under the wrong bars.
- Fixed a permission check that let any signed-in user mint a claim link for another organiser's player entry, or toggle registration on someone else's tournament.
- Duplicate-join guard stops a player self-registering when the organiser has already added them.
- Dashboard stats are per game rather than mixing games together, and the favourite-deck card is hidden for games without decks. Removed unused imports and a stale lint directive so the lint script passes clean.
- Copy rewrite: landing page, meta tags, patch notes, in-app alerts, dialogs, empty states and error messages put into plainer language; em dashes removed from UI text, keeping "—" only as the no-value placeholder. A later pass reverted copy that had crept back to em dashes.

### Changed
- Player stats brought in line with the organiser page: collapsible sections that remember what was left open, sortable/scroll-capped/exportable deck history and matchup matrix, and the shared timeline component. Deck key and label helpers consolidated into `utils/deck.ts`.
- Season handling follows the game: September–August for Pokemon, calendar year for everything else (`utils/statsPeriod.ts`). The interim Pokemon season-and-quarter stats filter was superseded by all time / calendar year.
- Post-match questions skip the opponent's deck for games without decks, and players are no longer offered a deck in a generic tournament.

### Migrations
- `20260825120000_identity_as_player_credential` — `assert_player_access` accepts account identity.
- `20260825130000_fix_null_role_guard` — COALESCE the role guard so a NULL (non-member) role no longer passes.
- `20260825140000_known_players_late_entry` — workspace known-players lookup + account-linked late entry.
- `20260825150000_late_join_active_tournament` — allow joining an in-progress tournament.
- `20260825160000_notify_late_join` — organiser notification on a self-added late entry.
- `20260825170000_late_join_no_free_bye` — late entrant takes a loss instead of a bye.
- `20260901000000_remove_player_from_round` — drop a player from a single round.
- `20260901000100_duplicate_join_guard` — block self-registration for an already-added player.
- `20260901000200_stats_season_filters` — season/quarter filtering on the stats RPCs.
- `20260901000300_multi_game_tournaments` — `game_id` + rules profile on tournaments; backfill to Pokemon.
- `20260901000400_game_neutral_join_codes` — neutral room codes for non-Pokemon games.
- `20260901000500_player_view_game_id`, `20260901000600_stats_per_game`, `20260901000700_dashboard_game_id` — thread `game_id` through the player view, stats and dashboard RPCs.
- `20260901010000_organiser_stats_foundation` through `20260901010400_organiser_deck_detail` — attendance, league table, meta share, event health and deck detail RPCs.
- `20260901010500_player_trend_bucket` — month/quarter/year trend buckets.
- `20260901010600_player_placement_tiers`, `20260901010700_monotonic_placement_tiers` — shared denominator and nesting for placement tiers.
- `20260901010900_round_timing_capture`, `20260901011000_timing_stats` — persist round/match timings and report on them.
- `20260901011100_deck_diversity` — effective deck count and top-deck share.
- `20260901011200_player_identity_merge`, `20260901011300_merge_dismissals` — merge/split player identities and remember dismissed suggestions.

### Tests
- New suites: `games/registry.test.ts`, `utils/statsPeriod.test.ts`, `utils/csv.test.ts`, `utils/tieBreaking.profiles.test.ts`, `components/StatsGameFilter.test.tsx`, `components/StatsPeriodFilter.test.tsx`, `components/PlayerNameInput.test.tsx`, `components/PlayerClaimLinkDialog.test.tsx`, `pages/TournamentJoin.test.tsx`, `pages/Tournaments.create.test.tsx`, `pages/TournamentMatches/PlayerManagementDialog.test.tsx`.

---

## [0.6.1] - 2026-07-27

### Added
- **Web push notifications** (Phase 2): players can opt in to OS-level push for the events that matter — a new round paired, the round timer running out, and final standings ready. Backed by a `send-push` Supabase edge function, a `push_subscriptions` table with player/organiser-targeting RPCs, and `pg_net` triggers/cron that fire on the relevant events. The app is now an installable PWA (manifest, service worker, icons) so the notifications work on iOS and Android home-screen installs. Opt-in prompts appear on the player and tournament views.
- **In-app alerts**: a new `PlayerNotifications` provider watches every tournament you've joined and raises a snackbar — with a one-tap link straight to your round — on any page. New `useAttentionAlert` hook adds a device vibration and a tab-title flash. Alerts fire once per round, personalised with your table/opponent, and stale time-up alerts are suppressed on late page loads. When OS push is granted the in-app toast is suppressed so foreground users see just one notification.
- New users are auto-provisioned a default personal workspace on first login instead of being sent to the create-workspace page. `RedirectToWorkspace` (`App.tsx`) now calls `create_workspace` when the user has no memberships (named from `display_name`, falling back to the email local-part), retries on slug collision, and falls back to `/workspaces/new` only if the RPC errors. The onboarding "organiser" choice (`Welcome.tsx`) routes through the same path. `/workspaces/new` is retained for additional workspaces and as the error fallback.
- **Tournament metadata** (Phase 1): tournaments gain optional `starts_at`, `game_format`, `location`, and `description` fields. Editable via a new Details section on the draft tournament page; surfaced read-only once the event is live. The tournaments list and dashboard now show format + scheduled date (falling back to created date), and the player join page shows when/where/format/notes before a player joins. `get_tournament_for_join` extended to return the new fields to anonymous joiners; length-capped by CHECK constraints. No capacity limit and no public discovery page in this phase.
- Branded favicon, social share previews (OpenGraph/Twitter meta + a 1200×630 share image), page title/description/`theme-color`/canonical URL, and "Sign up" / "Log in" cross-links between the auth pages.

### Fixed
- **Final placings were wrong for anything below the top spots.** Player-facing RPCs derived position from a points-only `RANK()`, so tied players collapsed (e.g. 5th showed as 3rd). Final standings — computed with the real tiebreakers — are now persisted on completion, and every player RPC (`get_my_player_entries`, `get_tournaments_summary`, overview, deck stats, top-finishes) reads the stored `position`. Added a backfill for existing completed tournaments.
- Signup could create **duplicate personal workspaces** when the DB signup trigger and the client auto-provision raced (or the client double-fired). Added an idempotent `ensure_personal_workspace()` RPC guarded by a per-user advisory lock; it returns the existing personal workspace if one is present, and the client now calls it instead of `create_workspace`.
- Entry-link handling: email/in-app browsers are steered to open in Chrome or install the PWA (so push/PWA features work), the "link" redirect loop is stopped, and an entry that belongs to another account now says so instead of silently failing to link.
- Push polish: pushes always show a visible notification (silent pushes were tripping Chrome's "possible spam" flag), the badge icon is monochrome so Android renders the "M" rather than a square, tapping a notification routes straight to the player's pairing page, and the title now leads with the opponent/round.
- Password-reset page no longer hangs on "Verifying reset link…". `ResetPassword.tsx` keyed off the transient `PASSWORD_RECOVERY` event, which supabase-js fires during client init before the page mounts; it now recognises the recovery session via `INITIAL_SESSION` + session presence, and shows an "invalid or expired link" state (with a re-request button) instead of hanging when no session is established.
- Self-registration with a Mega/regional/Gigantamax Pokémon no longer fails with "Invalid pokemon id". `self_join_tournament` capped deck IDs at 1025, but PokéAPI assigns form IDs from 10001+ (e.g. Mega Venusaur = 10033); aligned its bound with `set_player_deck` (1–99999).
- Restored auto-linking on `self_join_tournament`. The deck migration (`20260721120312`) rewrote the function and dropped `user_id = auth.uid()` from the INSERT, so joining while logged in created an unlinked entry — it never appeared in the account and forced a manual "Link" step on the My Tournaments page.
- Player tournament view (`/t/:id/me`) no longer shows "Not registered" for a signed-in owner viewing from a device without the local device token. Added `get_my_tournament_entry` RPC to recover the owner's `player_id` + `device_token` (authorised by `user_id = auth.uid()`), which `PlayerTournamentView` caches locally and reuses.
- New accounts now default their preferred role to **Player** (`profiles.onboarding_intent` default + account page shows Player selected when unset).
- Match result chips on the desktop matches table are no longer shown as dead, clickable-looking buttons before a round begins. `MatchTableDesktop` now only renders the win/draw/loss chips when the round is live (editable) or to display a completed result — matching the mobile card's behaviour.
- The standings tab and panel now read "Standings" while a tournament is in progress and only "Final Standings" once it's completed.
- The round-count stepper suggests a Swiss-appropriate round count (⌈log₂(players)⌉) with a one-click "Use N" when it differs from the current value.
- Replaced the ad-hoc single "Back" buttons and hard-coded "← My tournaments" link with a consistent **breadcrumb trail** across the tournament flow (new `Breadcrumbs` component). Organiser pages show `Dashboard › Tournaments › {name}` (and `… › Matches`); player pages show `Dashboard › My tournaments › {name}`; the two list pages show `Dashboard › Tournaments` / `Dashboard › My tournaments`. The dashboard is now one click from anywhere, and the list pages are no longer a forced one-way waypoint. Removed the now-unused `TournamentPageHeader` component.
- Mobile result entry (`MatchCardMobile`) replaced the abstract `1-0 / Draw / 0-1` green/yellow/red chips — which didn't map to either player — with a **"Who won?"** row of buttons labelled with the actual player names (`{p1} / Draw / {p2}`). Tapping a player fills their button green and highlights their card. Desktop is unchanged (its per-player chip rows are already unambiguous).

### Migrations
- `20260726212718_fix_self_join_pokemon_id_range` — widen `self_join_tournament` deck ID validation to 1–99999.
- `20260726214422_player_flow_fixes` — restore `self_join_tournament` auto-link; add `get_my_tournament_entry`; default `profiles.onboarding_intent` to `'player'`.
- `20260726223324_tournament_metadata` — add `starts_at`/`game_format`/`location`/`description` columns (+ length CHECKs); extend `get_tournament_for_join` to return them.
- `20260727090000_ensure_personal_workspace` — idempotent `ensure_personal_workspace()` RPC with per-user advisory lock.
- `20260727100000_web_push` — `push_subscriptions` table, player/organiser-targeting RPCs, and `pg_net` triggers/cron for pairing / round time-up / standings-ready push events.
- `20260727120000_persist_standings` — persist final standings (real tiebreakers) on completion; player RPCs read the stored `position`.
- `20260727130000_stats_top_finishes_from_standings` — top-finishes/placing stats read from stored standings.

### Ops / Config (no code)
- Enabled prod auth with email verification; configured custom SMTP via Resend (sender on the verified `notifications.matchamp.win` subdomain) to lift the built-in 2/hour email cap.
- Set Site URL to `https://matchamp.win` and redirect allow-list to `https://matchamp.win/**`.
- Branded the "Confirm signup" and "Reset password" email templates (navy/crimson, table-based inline HTML).
- Added a DMARC record (`_dmarc.matchamp.win` → `v=DMARC1; p=none;`) in Cloudflare to stop reset emails landing in spam.
- Deployed the `send-push` edge function and set VAPID secrets for web push (the function boots cleanly before the secrets are configured).

---

## [0.6.0] - 2026-07-26

### Added
- **Player stats page** (`/stats`) with an overview panel, deck history, matchup matrix, round-by-round performance, and a quarterly trend chart.
- **Post-game insights**: players can record whether they went first and which deck their opponent played after a match. Backed by a new `match_insights` table and `upsert_match_insights` RPC (validates match participation and Pokémon IDs).
- Six player-stat RPCs: `get_player_overview_stats`, `get_player_deck_stats`, `get_player_matchup_matrix`, `get_player_round_performance`, `get_player_trend`, `get_player_first_second_stats`.
- `get_opponent_went_first` RPC — safely reads the opponent's went-first answer for matches you participated in, so a player's own answer can be pre-filled by inversion.
- **Snapshot dashboard** redesign: active-tournament spotlight, recent-5 tournaments list, headline stat row (joined / active / completed / on-device), and a contextual time-of-day greeting.
- Player stats surfaced on the dashboard (completed, won, win rate, favourite deck); `get_my_player_entries` and `get_tournaments_summary` extended to return position, match wins/totals, and deck data.
- **Organiser/Player view switcher** in the header, later unified into Organising/Playing home tabs (`Home.tsx`) defaulting by `onboarding_intent`.
- **Player self-claim onboarding**: `self_claim_player_entry` RPC (device-token account linking) and an `AutoClaimer` that silently claims localStorage entries on login; sign-up nudge banners for anonymous players.
- Unified `/my-tournaments` view merging DB-linked and device entries with inline claim buttons.
- Preferred-role toggle on the account page (saved to `profiles.onboarding_intent`).
- Deck selection required when self-registering — inline `DeckPicker` (extracted from `DeckPickerDialog`); `self_join_tournament` extended to store the deck on insert.
- **GDPR compliance**: privacy policy and terms pages, self-serve account deletion with shared-workspace handover, and a daily `pg_cron` purge of old audit logs and spent invite emails.

### Fixed
- Tiebreakers aligned with the Play! Pokémon handbook §5.3.3/§5.5.1.1: win % is now wins÷rounds with byes excluded, draws no longer count as half-wins, the 75% floor applies only to dropped players, and head-to-head is restricted to exactly-two-player ties. Standings and pairing now share one win-percentage formula.
- Insights gated on result submission; opponent's deck stays locked until the match is confirmed complete, then unlocks and pre-fills automatically.
- Corrected `match_insights.player_id` joins (it references `auth.users.id`, not `tournament_players.id`) that were silently dropping insights from every stats calculation.
- Current-streak now counts back from the latest result; deck filter activates when either slot is set; draw-inclusive captions no longer mislabel draws as losses.
- Win rate counts byes as wins and shows one decimal place; auto-linking sets `user_id = auth.uid()` when joining while authenticated.
- Self-registered players can rejoin after an organiser removes them; removed players are redirected back to the join form.
- Dashboards no longer flash the loading skeleton on tab refocus (`initialLoadDoneRef`; removed `workspaceLoading` from `isLoading`).

### Security
- Revoked `SELECT` on `tournament_players.device_token`/`device_id` and `EXECUTE` on `purge_unclaimed_player_entries`/`cleanup_audit_log` from anon + authenticated roles; Self-reg chip now derived from `created_by`.
- Scoped `tournament_matches` anon SELECT to self-registration tournaments and `match_result_reports` SELECT to workspace members (was `USING(true)`); `accept_workspace_invite` now verifies caller email.
- Pinned `search_path` on remaining SECURITY DEFINER functions; capped self-registration names at 50 chars; stopped shipping production source maps; `Secure` flag on the device-token cookie.
- Removed the stale `tournament-organizer-backend.onrender.com` origin from the CSP `connect-src` — all data access is via Supabase.

### Refactored / Removed
- Split player match history (`/my-tournaments`) from account management (`/me`, "My Account"); removed the workspace dropdown from the header and added a Dashboard nav link.
- Removed dead dummy-auth endpoints, the `apiCall` helper and JWT plumbing, an unused rematch-escape branch in pairing, and unused `jwt`/`passport`/`node-fetch` deps from the root `package.json`.

### Migrations
- `20260421000000_self_claim_player_entry`, `20260618000000`–`20260618000005` (dashboard stats, autolink, win-rate, `match_insights`, stats RPCs), `20260619000000`/`20260619000001` (insights join fix, opponent-went-first), `20260721120312_self_join_with_deck`.

---

## [0.5.0] - 2026-06-17

### Added
- Live indicator badge on pairings and player view pages so participants know the page is actively tracking the tournament.
- Print / PDF export for round pairings and standings — organiser can export any round directly from the UI.
- Collapsible pairing decision log on the pairings page showing per-rematch player names so organisers can audit why a pair was generated.
- Supabase connectivity errors are now detected and surfaced on startup rather than silently failing.
- Duplicate names are now blocked on the tournament join page with an inline error.
- Retry button added to the error alert shown when a round operation fails.
- React error boundaries added throughout the app to prevent a single component crash from blanking the whole page.
- GitHub Actions workflow to ping the Supabase project on a schedule and prevent it from pausing due to inactivity.
- Dev console tools for component inspection and query logging (dev/preview builds only, gated by `VITE_DEV_TOOLS`).

### Fixed
- Confirmation dialogs added for all destructive tournament actions (delete round, clear results, etc.).
- Copy-to-clipboard actions now show a toast notification confirming the copy succeeded.
- Empty states across the app now have actionable CTAs rather than plain "nothing here" messages.
- Pairings and standings tables have improved responsive mobile layouts.
- Switching away from and back to the tournament page no longer resets tournament state or flashes a loading skeleton.
- Pages with async data no longer flash the loading skeleton when the browser tab is refocused.
- Errors on the Me and Device Tournaments pages are now surfaced to the user instead of silently swallowed.
- Missing fields in `tournament` and `rounds` update selects that could cause stale UI state after mutations.

### Changed
- Reverted the announcement / round note redesign introduced in a prior branch; `round_note` behaviour restored to its previous state.

### Refactored
- `TournamentMatches.tsx` split into focused hooks (`useMatchData`, `useMatchReports`, `usePendingResults`, `usePairingEditor`, `useRoundLifecycle`) and components (`ScoreDialog`, `DeleteRoundDialog`, `LateEntryDialog`, `RoundNoteField`, `PairingDecisionAlert`, `TimerEditor`, `RoundTabs`, `RoundActionBar`, `PlayerManagementDialog`).
- Consolidated `Match`, `Tournament`, and `Player` types into a shared `types/` directory.
- Qualified `gen_random_bytes` as `extensions.gen_random_bytes` in migrations so they run portably outside the Supabase hosted environment.

---

## [0.4.3] - 2026-05-31

### Fixed
- Swiss tiebreakers now use Opponent Match Win % (OMW%) and Opponent's Opponent Match Win % (OOMW%) instead of UUID ordering. Standings after tied records now reflect actual opponent strength.
- Draws correctly count as 0.5 wins when calculating OMW%, matching standard Pokémon TCG tiebreaker rules.
- Swiss pairing: floater player no longer gets rematched when a clean opponent exists in the lower bracket.
- Removed the top/bottom bracket split from Swiss pairing logic that was causing unnecessary rematches.

### Tests
- Expanded Swiss pairing test suite with 646 additional cases covering floater, bye, and rematch edge cases.
- Added tiebreaker tests for draw handling in OMW% calculations.

### Chores
- Backend `tsconfig.json`: added `ignoreDeprecations: "6.0"` to silence TypeScript 6.x `moduleResolution=node10` deprecation warning ahead of TS 7.0.

---

## [0.4.2] - 2026-04-06

### Added
- "My Tournaments" link added to the logged-out header navigation.
- Burger menu for mobile on the landing page nav and logged-out header.
- Join display screen now renders the join URL in a larger, cleaner layout.

### Changed
- Lighthouse performance pass: preloaded fonts, explicit image dimensions for CLS, `priority` flag on LCP images.
- Standings table density tightened when the deck column is present.
- Removed unused constants.

### Fixed
- Player agreement on a result no longer auto-completes the match — organiser confirmation is always required.
- Added `'conflict'` to the `confirmed_by` check constraint on `tournament_matches`.
- Organiser matches view no longer scrolls back to the top when a result is entered or submitted by a player. Root causes: `fetchTournament` was included in `refreshTrigger` deps (triggering `loading=true`); `fetchMatches` was setting `matchesLoading=true` on background refreshes. Both fixed.

---

## [0.4.1] - 2026-03-28

### Changed
- Removed public tournament toggle (UI + `handleTogglePublic` handler) from tournament setup panel.
- Removed "known players" shortcut button from the add-player flow.
- Pairings link now opens in a new tab.

### Fixed
- Mobile UX improvements for player result entry and standings view.
- Light mode rendering on the landing page.
- Header and landing page navigation polish.
- Various tournament flow and timer fixes.

---

## [0.4.0] - 2026-03-28

### Added
- **Tournament self-registration** — organisers can enable a join code (Pokémon-named room code) on any tournament. Players enter the code or open a shareable URL (join code embedded in query string) to register themselves without an account. `join_enabled` toggle + `room_code` column on `tournaments`.
- **Player result submission** — players can report their own match result from the player view. The first report auto-applies the result to the match; subsequent conflicting reports queue for organiser confirmation. Organiser can always override.
- **My Tournaments page** (`/my-tournaments`) — lists all tournaments the device has joined, with live polling for status updates. Deleted tournaments are filtered out.
- **Organiser round announcements** — organisers can add a note to any round; it appears as an announcement banner on the public pairings page.
- **Pokémon deck picker** — players can select a Pokémon to represent their deck. Sprites are shown in the standings table and pairings view. Pokémon list (Gen 1–3 + Mega/form variants) is generated at build time. `set_player_deck` RPC accepts Mega/alternate-form IDs.
- **Timer: add/edit after creation** — the round timer can now be added or modified after a tournament has already been created, not just at setup time.
- **Timer quick-adjust buttons** — +/-1m and +/-10m buttons in the timer editor for faster adjustments.
- **Auto-tab switching on pairings page** — automatically switches to the new round tab when a round starts; switches to standings tab when the final round ends.
- `self_registered` indicator column in player list, replacing the account-link column.
- Security headers served via `frontend/public/_headers`.

### Changed
- Self-registration is always enabled for draft tournaments — the separate toggle is no longer needed.
- Matches view now defaults to the current round tab instead of round 1.
- Tournament details panel UI refreshed.
- Removed suggested rounds input and bye warning from tournament setup.
- Player view shows all device-joined tournaments (not just the current one) so players can navigate between events.

### Fixed
- Result chip reflects player report immediately without a page refresh.
- Player result submissions correctly populate organiser pending results queue.
- Player-submitted results are reflected in the organiser matches view in real-time.
- Organiser result-confirm flow works correctly alongside the player report flow.
- Player list no longer scrolls back to the top during background polls.
- Dropped players are sorted to the bottom of standings (both organiser and public views).
- Pairings page update reliability improved.
- Auto-redirect to player view after self-registration (previously showed a button instead).
- `join_enabled` state correctly persists on page refresh; player self-registrations stream in real-time.
- Deck sprites display correctly in pairings and standings.
- Fixed tournament data failing to load on the device tournaments page.
- Guard against NaN in seat number input.

### Database Migrations
- `20260310010000_tournaments_realtime` — enable realtime on tournaments table
- `20260324000000_add_round_note` — `round_note` column for organiser announcements
- `20260325000000_tournament_matches_select_anon` — anon select policy on matches
- `20260325000001_tournament_matches_realtime` — realtime on matches
- `20260325000002_player_view_temp_result` — temp result column for player view
- `20260325120000_get_tournaments_summary` — `get_tournaments_summary` RPC
- `20260325130000_get_tournaments_summary_v2` — v2 of summary RPC
- `20260325140000_fix_get_tournaments_summary` — fix summary RPC
- `20260325150000_fix_get_tournaments_summary_unnest` — fix unnest in summary RPC
- `20260326000000_tournament_self_registration` — self-registration support
- `20260326000001_nullable_created_by` — allow null `created_by` for self-registered players
- `20260326000002_tournament_players_realtime` — realtime on tournament_players
- `20260326000003_join_code` — `room_code` + `join_enabled` columns on tournaments
- `20260326000004_clean_pokemon_list` — cleaned Pokémon list seed data
- `20260327000000_match_result_reports` — `match_result_reports` table
- `20260327000001_player_tournament_rpcs` — RPCs for player tournament interactions
- `20260327000002_fix_player_view_null_arrays` — fix null array handling in player view RPC
- `20260327000003_match_reports_realtime` — realtime on match_result_reports
- `20260328000000_auto_confirm_first_report` — auto-confirm match on first player report
- `20260329000000_organiser_confirms_results` — organiser result confirmation flow
- `20260329000001_match_reports_rls_select` — RLS select policy on match_result_reports
- `20260329000002_fix_workspace_memberships_ref` — fix FK reference in workspace_memberships
- `20260330000000_player_auto_applies_result` — player report auto-applies match result
- `20260330000001_player_report_sets_temp_result` — player report sets temp result on match
- `20260330000002_join_enabled_by_default` — `join_enabled` defaults to true for draft tournaments
- `20260331000000_pokemon_deck` — `player_deck` column + `set_player_deck` RPC
- `20260331000001_fix_deck_pokemon_id_range` — expand valid Pokémon ID range for Mega/forms

---

## [0.3.0] - 2026-03-10

### Added
- Full marketing landing page replacing the old placeholder at `/`. Dark-themed, full-screen layout with
  hero, features grid, how-it-works steps, standings showcase, audience sections, and final CTA.
- `ScreenshotFrame` component inside Landing for browser-chrome screenshot embeds.
- Screenshots served from `frontend/public/screenshots/` (matches, setup, standings, dashboard).

### Changed
- `App.tsx` refactored: extracted `AppLayout` component (Header + Container wrapper). The root route `/`
  now renders outside `AppLayout` so Landing gets full-viewport width and no app header.

---

## [0.2.4] - 2026-03-10

### Added
- Round timer pause/resume support. Two new columns on `tournaments`:
  `round_elapsed_seconds INTEGER DEFAULT 0` and `round_is_paused BOOLEAN DEFAULT FALSE`
  (migration `20260310000000_add_timer_pause.sql`).
- `RoundTimer` component accepts `elapsedSeconds` and `isPaused` props. When paused, the
  interval is cleared, the label changes to "PAUSED", and the colour switches to amber.
  `startedAt` is now nullable so it can be null while the timer is frozen.
- Pause/resume icon button rendered inline next to the timer in `TournamentMatches`.
  Pressing pause freezes elapsed time in the DB; pressing resume sets a new `current_round_started_at`
  and the countdown resumes from where it stopped.
- `TournamentPairings` `showTimer` condition now also triggers when `round_is_paused` is true
  so the frozen timer remains visible to players on the public/pairings view.
- `handleBeginRound`, tournament-complete, and round-advance all reset the two new columns
  to their defaults so each round starts clean.

---

## [0.2.3] - 2026-03-10

### Fixed
- Swiss pairing: bye selection in the last (odd) bracket now tries all bye candidates in
  priority order to find one that avoids a rematch among the remaining players. Previously
  the lowest-score player always received the bye, which could leave the last two players —
  who had already played each other — with no option but a forced rematch. Fix: walk down the
  candidate list until a zero-rematch remainder is found; only fall back to the default when
  a rematch is truly unavoidable. No artificial limit on float distance is applied.
  Reproduces and fixes the reported 11-player, 4-round scenario (two 1pt players forced into
  a rematch in round 3 because the 0pt player received the bye by default).
- Added FIX 10 note to algorithm header comment in `tournamentPairing.ts`.

### Tests
- New test: `bye is given to a higher-score player to avoid a rematch among the remainder`
  (3-player focused unit test for the bye-rematch fix).
- New test: `11-player round-3: no rematch when last two 1pt players drew each other in round 2`
  (full simulation of the reported scenario).
- Renamed existing bye-priority test to `bye still goes to lowest-score player when no rematch risk exists` for clarity.

---

## [0.2.2] - 2026-03-10

### Fixed
- Mobile pairing editor: the Edit Pairings mode was silently a no-op on mobile — the mobile card view had no `editingPairings` branch, while the desktop table (which has the X-to-remove and Select-to-assign controls) is hidden on `xs`. Added full editing mode support to the mobile card view: assigned slots show player name + remove (×) button; empty slots show a full-width dropdown to assign from the available pool. Result entry chips are suppressed while editing mode is active to avoid UI confusion.

---

## [0.2.1] - 2026-03-09

### Added
- `CHANGELOG.md` — developer-facing release history (Keep a Changelog format)
- `CLAUDE.md` — instructions for Claude to maintain changelogs and commit messages going forward
- `frontend/src/data/patchNotes.ts` — structured user-facing patch notes data file
- `frontend/src/pages/WhatsNew.tsx` — in-app What's New page at `/whats-new`
- "What's New" link added to header (desktop nav and mobile drawer)

---

## [0.2.0] - 2026-03-09

### Added

**Workspaces**
- Create, view, and delete workspaces
- Invite members to workspaces via shareable invite links (`/accept-invite`)
- New Workspace Settings page with member list and danger zone
- Workspace chip/selector in the header for switching between workspaces

**Players & Linking**
- Players can now claim their own player entries and link them to their account (`/claim-player`)
- `get_my_player_entries` function surfaces a user's linked tournament entries on their profile
- Late entry support — players can be added to a tournament after it has started

**Round Timer**
- New `RoundTimer` component displayed on active rounds
- Database migration to persist round timer data

**Audit Logs**
- Full audit log system tracking key tournament and workspace actions

**Auth & Registration**
- Forgot Password page (`/forgot-password`)
- Reset Password page (`/reset-password`)
- Password recovery flow

**Test Suite**
- Vitest configured for the frontend
- Tests for: `StandingsTable`, `useTournament`, `useTournamentPlayers`, `tournamentPairing`, `tournamentUtils`, `standings.pipeline`, `tieBreaking`, `format`, `slugify`

**Utilities**
- `slugify` utility added

### Changed

**Tournament**
- Major overhaul of `TournamentView`, `TournamentMatches`, and `TournamentPairings`
- Results/leaderboard page redesigned with improved standings display
- Rounds can now be modified after a tournament has started
- Real-time / instant match and pairings refresh
- Improved pairing notes feedback

**Auth & UX**
- Improved registration and login flow
- Improved mobile UX across auth screens
- Fixed login redirect behaviour
- Multiple rounds of general UX polish across the app

**Profile**
- Significant expansion of the `/me` profile page

### Fixed
- Static seating input bug
- Text shift in match UI
- Various small fixes across multiple sessions

### Removed
- "Add round" button no longer shown after a tournament finishes
- Removed deprecated `Players` and `Leagues` pages
- Consolidated types into shared `tournament.ts`
- Removed old split pairing quality test files (consolidated into main test suite)

### Database Migrations
- `20260225060000` — Workspace management
- `20260225070000` — Workspace delete policy
- `20260225080000` — Workspace invites
- `20260226000000` — Workspace players
- `20260226010000` — Player claims
- `20260226020000` — `get_my_player_entries`
- `20260306000000` — Late entry support
- `20260308000000` — Audit log
- `20260308010000` — Round timer

---

## [0.1.0] - initial release

- Initial tournament organiser: create tournaments, manage players, generate Swiss pairings, record match results, view standings.
