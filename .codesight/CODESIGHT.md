# matchamp — AI Context Map

> **Stack:** express | none | react | typescript
> **Monorepo:** matchamp-frontend, matchamp-backend

> 5 routes | 12 models | 34 components | 10 lib files | 9 env vars | 3 middleware | 12% test coverage
> **Token savings:** this file is ~3,600 tokens. Without it, AI exploration would cost ~32,000 tokens. **Saves ~28,300 tokens per conversation.**
> **Last scanned:** 2026-04-20 10:12 — re-run after significant changes

---

# Routes

- `GET` `/api/health` params() [auth]
- `GET` `/api` params() [auth]
- `POST` `/api/users` params() [auth]
- `POST` `/api/login` params() [auth]
- `ALL` `/api/*` params() [auth]

---

# Schema

### tournaments
- id: uuid (pk)
- name: text (required)
- created_by: uuid (required)
- status: text (required)
- tournament_type: text (required)
- num_rounds: integer

### tournament_players
- id: uuid (pk)
- tournament_id: uuid (required, fk)
- name: text (required)
- created_by: uuid (required)
- dropped: boolean (required)
- dropped_at_round: integer
- has_static_seating: boolean (required)
- static_seat_number: integer

### tournament_matches
- id: uuid (pk)
- tournament_id: uuid (required, fk)
- round_number: integer (required)
- player1_id: uuid (required, fk)
- player2_id: uuid (fk)
- winner_id: uuid (fk)
- result: text
- temp_winner_id: uuid (fk)
- temp_result: text
- match_number: integer
- status: text (required)
- pairing_decision_log: jsonb

### tournament_standings
- tournament_id: uuid (required, fk)
- player_id: uuid (required, fk)
- match_points: integer (required)
- wins: integer (required)
- losses: integer (required)
- draws: integer (required)
- matches_played: integer (required)
- byes_received: integer (required)

### workspaces
- id: uuid (pk)
- name: text (required)
- slug: text (required)
- type: text (required)
- created_by: uuid (fk)

### workspace_memberships
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- user_id: uuid (required, fk)
- role: text (required)

### profiles
- id: uuid (pk)
- display_name: text
- default_workspace_id: uuid (fk)

### workspace_invites
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- email: text (required)
- role: text (required)
- invited_by: uuid (required)
- token: text (required)
- status: text (required)
- expires_at: timestamp(tz) (required)

### workspace_players
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- user_id: uuid (required, fk)
- preferred_name: text

### tournament_player_claims
- id: uuid (pk)
- tournament_player_id: uuid (required, fk)
- workspace_id: uuid (required, fk)
- token: text (required)
- created_by: uuid (required)
- status: text (required)
- expires_at: timestamp(tz) (required)

### audit_log
- id: uuid (pk)
- table_name: text (required)
- record_id: uuid (fk)
- operation: text (required)
- user_id: uuid (fk)
- old_data: jsonb
- new_data: jsonb
- changed_at: timestamp(tz) (required)

### match_result_reports
- id: uuid (pk)
- match_id: uuid (required, fk)
- player_id: uuid (required, fk)
- reported_outcome: text (required)
- submitted_at: timestamp(tz) (required)

---

# Components

- **RequireAuth** — `frontend\src\App.tsx`
- **AuthProvider** — `frontend\src\AuthContext.tsx`
- **PokemonSlot** — props: open, onClose, initialPokemon1, initialPokemon2, onSave — `frontend\src\components\DeckPickerDialog.tsx`
- **BORDER** — `frontend\src\components\Header.tsx`
- **NormalizedSprite** — props: src, size — `frontend\src\components\NormalizedSprite.tsx`
- **PageLoading** — props: minHeight — `frontend\src\components\PageLoading.tsx`
- **RoundTimer** — props: startedAt, durationMinutes, elapsedSeconds, isPaused, size — `frontend\src\components\RoundTimer.tsx`
- **ChunkTable** — props: standings, droppedMap, deckMap, currentPlayerId — `frontend\src\components\StandingsTable.tsx`
- **TournamentPageHeader** — props: title, onBack, backLabel — `frontend\src\components\TournamentPageHeader.tsx`
- **AcceptInvite** — `frontend\src\pages\AcceptInvite.tsx`
- **ClaimPlayer** — `frontend\src\pages\ClaimPlayer.tsx`
- **WORKSPACE_TYPES** — `frontend\src\pages\CreateWorkspace.tsx`
- **Dashboard** — `frontend\src\pages\Dashboard.tsx`
- **DeviceTournaments** — `frontend\src\pages\DeviceTournaments.tsx`
- **ForgotPassword** — `frontend\src\pages\ForgotPassword.tsx`
- **JoinLanding** — `frontend\src\pages\JoinLanding.tsx`
- **Landing** — `frontend\src\pages\Landing.tsx`
- **Login** — `frontend\src\pages\Login.tsx`
- **ROLE_COLOR** — `frontend\src\pages\Me.tsx`
- **MyMatchCard** — props: match, playerId, myReport, entry, onRefresh — `frontend\src\pages\PlayerTournamentView.tsx`
- **Register** — `frontend\src\pages\Register.tsx`
- **ResetPassword** — `frontend\src\pages\ResetPassword.tsx`
- **TournamentJoin** — `frontend\src\pages\TournamentJoin.tsx`
- **TournamentJoinDisplay** — `frontend\src\pages\TournamentJoinDisplay.tsx`
- **TournamentLeaderboard** — `frontend\src\pages\TournamentLeaderboard.tsx`
- **MATCH_STATUS** — `frontend\src\pages\TournamentMatches.tsx`
- **TournamentPairings** — `frontend\src\pages\TournamentPairings.tsx`
- **Tournaments** — `frontend\src\pages\Tournaments.tsx`
- **AddPlayerInput** — props: onAdd, disabled, inputRef, onBulkMode — `frontend\src\pages\TournamentView.tsx`
- **Welcome** — `frontend\src\pages\Welcome.tsx`
- **WhatsNew** — `frontend\src\pages\WhatsNew.tsx`
- **WorkspaceSettings** — `frontend\src\pages\WorkspaceSettings.tsx`
- **AppThemeProvider** — `frontend\src\ThemeContext.tsx`
- **WorkspaceProvider** — `frontend\src\WorkspaceContext.tsx`

---

# Libraries

- `frontend\src\hooks\useTournament.ts` — function useTournament: (id, user, authLoading, workspaceId) => void
- `frontend\src\hooks\useTournamentPlayers.ts` — function useTournamentPlayers: (tournamentId) => void
- `frontend\src\utils\api.ts` — function apiCall, function handleApiError
- `frontend\src\utils\format.ts` — function formatDate: (dateString) => string, function formatDateTime: (value) => string
- `frontend\src\utils\playerStorage.ts`
  - function entryKey: (tournamentId) => void
  - function getProfile: () => TjProfile
  - function saveProfile: (name, deviceId) => void
  - function getEntry: (tournamentId) => TjEntry | null
  - function saveEntry: (tournamentId, entry) => void
  - function getAllEntries: () => Array<
  - _...3 more_
- `frontend\src\utils\pokemonCache.ts`
  - function getSpriteUrl: (id) => string
  - function getArtworkUrl: (id) => string
  - function getPokemonList: () => Promise<PokemonEntry[]>
  - interface PokemonEntry
- `frontend\src\utils\slugify.ts` — function slugify: (input) => string, function randomSuffix: (len) => string
- `frontend\src\utils\tieBreaking.ts`
  - function calculateOpponentMatchWinPercentage: (player, allStandings, PlayerStanding>) => number
  - function calculateOpponentOpponentMatchWinPercentage: (player, allStandings, PlayerStanding>) => number
  - function addTieBreakers: (standings) => PlayerWithTieBreakers[]
  - function sortByTieBreakers: (standings, droppedIds?) => PlayerWithTieBreakers[]
  - interface PlayerStanding
  - interface PlayerWithTieBreakers
- `frontend\src\utils\tournamentPairing.ts`
  - function calculateMatchPoints: (wins, draws) => number
  - function groupByMatchPoints: (standings) => Map<number, PlayerStanding[]>
  - function havePlayedBefore: (player1Id, player2Id, previousPairings) => boolean
  - function generateSwissPairings: (standings, roundNumber, previousPairings) => PairingResult
  - function generateRound1Pairings: (tournamentType, players) => Pairing[]
  - interface PlayerStanding
  - _...3 more_
- `frontend\src\utils\tournamentUtils.ts`
  - function buildStandingsFromMatches: (matches, allPlayers?) => PlayerStanding[]
  - function getTournamentTypeLabel: (type) => string
  - function calculateSuggestedRounds: (playerCount, tournamentType) => number
  - function assignMatchNumbers: (pairings, staticSeats, number>, // playerId → seatNumber) => SeatAssignment[]
  - interface MatchForStandings
  - interface SeatConflict
  - _...1 more_

---

# Config

## Environment Variables

- `DATABASE_URL` (has default) — backend\.env
- `DEV` **required** — frontend\src\utils\api.ts
- `FRONTEND_URL` (has default) — backend\.env
- `JWT_SECRET` (has default) — backend\.env
- `NODE_ENV` (has default) — backend\.env
- `PORT` (has default) — backend\.env
- `VITE_API_URL` **required** — frontend\src\utils\api.ts
- `VITE_SUPABASE_ANON_KEY` **required** — frontend\src\supabaseClient.ts
- `VITE_SUPABASE_URL` **required** — frontend\src\supabaseClient.ts

## Config Files

- `frontend\vite.config.ts`
- `render.yaml`

## Key Dependencies

- passport: ^0.7.0

---

# Middleware

## custom
- generatePokemonList — `scripts\generatePokemonList.mjs`

## cors
- cors — `backend\src\index.ts`

## logging
- morgan — `backend\src\index.ts`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `frontend\src\supabaseClient.ts` — imported by **23** files
- `frontend\src\AuthContext.tsx` — imported by **15** files
- `frontend\src\WorkspaceContext.tsx` — imported by **14** files
- `frontend\src\utils\tieBreaking.ts` — imported by **8** files
- `frontend\src\types\tournament.ts` — imported by **7** files
- `frontend\src\utils\tournamentUtils.ts` — imported by **6** files
- `frontend\src\components\StandingsTable.tsx` — imported by **5** files
- `frontend\src\utils\tournamentPairing.ts` — imported by **4** files
- `frontend\src\ThemeContext.tsx` — imported by **3** files
- `frontend\src\hooks\useTournament.ts` — imported by **3** files
- `frontend\src\utils\format.ts` — imported by **3** files
- `frontend\src\utils\pokemonCache.ts` — imported by **2** files
- `frontend\src\hooks\useTournamentPlayers.ts` — imported by **2** files
- `frontend\src\utils\slugify.ts` — imported by **2** files
- `frontend\src\utils\playerStorage.ts` — imported by **2** files
- `frontend\src\components\PageLoading.tsx` — imported by **2** files
- `frontend\src\components\RoundTimer.tsx` — imported by **2** files
- `frontend\src\components\Header.tsx` — imported by **1** files
- `frontend\src\pages\Dashboard.tsx` — imported by **1** files
- `frontend\src\pages\Tournaments.tsx` — imported by **1** files

## Import Map (who imports what)

- `frontend\src\supabaseClient.ts` ← `frontend\src\AuthContext.tsx`, `frontend\src\hooks\useTournament.test.ts`, `frontend\src\hooks\useTournament.ts`, `frontend\src\hooks\useTournamentPlayers.test.ts`, `frontend\src\hooks\useTournamentPlayers.ts` +18 more
- `frontend\src\AuthContext.tsx` ← `frontend\src\App.tsx`, `frontend\src\components\Header.tsx`, `frontend\src\main.tsx`, `frontend\src\pages\AcceptInvite.tsx`, `frontend\src\pages\ClaimPlayer.tsx` +10 more
- `frontend\src\WorkspaceContext.tsx` ← `frontend\src\App.tsx`, `frontend\src\components\Header.tsx`, `frontend\src\pages\AcceptInvite.tsx`, `frontend\src\pages\CreateTournament.tsx`, `frontend\src\pages\CreateWorkspace.tsx` +9 more
- `frontend\src\utils\tieBreaking.ts` ← `frontend\src\components\StandingsTable.test.tsx`, `frontend\src\components\StandingsTable.tsx`, `frontend\src\pages\PlayerTournamentView.tsx`, `frontend\src\pages\TournamentLeaderboard.tsx`, `frontend\src\pages\TournamentMatches.tsx` +3 more
- `frontend\src\types\tournament.ts` ← `frontend\src\hooks\useTournament.test.ts`, `frontend\src\hooks\useTournament.ts`, `frontend\src\hooks\useTournamentPlayers.test.ts`, `frontend\src\hooks\useTournamentPlayers.ts`, `frontend\src\pages\TournamentLeaderboard.tsx` +2 more
- `frontend\src\utils\tournamentUtils.ts` ← `frontend\src\pages\PlayerTournamentView.tsx`, `frontend\src\pages\TournamentLeaderboard.tsx`, `frontend\src\pages\TournamentPairings.tsx`, `frontend\src\utils\standings.pipeline.test.ts`, `frontend\src\utils\standings.pipeline.test.ts` +1 more
- `frontend\src\components\StandingsTable.tsx` ← `frontend\src\components\StandingsTable.test.tsx`, `frontend\src\pages\PlayerTournamentView.tsx`, `frontend\src\pages\TournamentLeaderboard.tsx`, `frontend\src\pages\TournamentMatches.tsx`, `frontend\src\pages\TournamentPairings.tsx`
- `frontend\src\utils\tournamentPairing.ts` ← `frontend\src\pages\TournamentView.tsx`, `frontend\src\utils\tournamentPairing.test.ts`, `frontend\src\utils\tournamentUtils.test.ts`, `frontend\src\utils\tournamentUtils.ts`
- `frontend\src\ThemeContext.tsx` ← `frontend\src\components\Header.tsx`, `frontend\src\main.tsx`, `frontend\src\pages\Landing.tsx`
- `frontend\src\hooks\useTournament.ts` ← `frontend\src\hooks\useTournament.test.ts`, `frontend\src\pages\TournamentJoinDisplay.tsx`, `frontend\src\pages\TournamentView.tsx`

---

# Test Coverage

> **12%** of routes and models are covered by tests
> 9 test files found

## Covered Models

- tournaments
- tournament_players

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_