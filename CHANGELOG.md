# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
