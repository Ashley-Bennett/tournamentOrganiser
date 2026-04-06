# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.4.3] - 2026-04-06

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
