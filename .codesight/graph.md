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
