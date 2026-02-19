# Database structure recommendations for Swiss pairings

The pairing algorithm in `frontend/src/utils/tournamentPairing.ts` currently gets all its input by **deriving** standings and opponent history from `tournament_matches`. That works but is fragile: any bug in the derivation (e.g. which matches count as completed, draw handling, bye handling) or in the order/consistency of data can cause assertions to fail (“breaking” the algorithm). Below are schema and usage changes that make the data model support the algorithm more reliably.

---

## What’s already in place (seed.sql)

- **Unique indexes on `tournament_matches`** so the DB enforces:
  - No duplicate pair in the same round: you can’t have both (A,B) and (B,A) (or the same pair twice).
  - Each player appears at most once per round (as player1 or player2).
- **`tournament_standings` table**: optional materialized standings (match_points, wins, losses, draws, matches_played, byes_received). When you update this on result/bye save, the pairer can read from it instead of recomputing from matches.
- **Deterministic ordering**: when building “previous pairings” for the next round, matches are sorted by `round_number` then `id` so rematch checks are stable.

---

## 1. **Materialized “standings” / “round state” (high impact)**

**Problem:** Standings (match points, wins, losses, draws, opponents, byes) are recomputed in several places (TournamentMatches, TournamentLeaderboard, next-round generation) from raw matches. If any of those derivations disagree (e.g. what counts as “completed”, draws, byes), you get inconsistent standings and the pairing assertions can fail.

**Recommendation:** Store standings (or at least the values the pairer needs) in the database, updated when match results are saved.

**Option A – Dedicated table `tournament_standings` (per player per tournament, current snapshot):**

- `tournament_id`, `player_id` (PK or unique)
- `match_points`, `wins`, `losses`, `draws`, `matches_played`, `byes_received`
- Optional: `opponent_ids` (array of UUIDs) or a separate `tournament_opponents` table (see below)
- Updated by a trigger or API when a match is completed / set to bye.

**Option B – Round-level state:**  
A table that stores, per tournament and round, the “standings used for pairing this round” (e.g. JSON or columns). Less normalised but gives an explicit snapshot for each round.

**Why it helps:** The pairer receives a single, authoritative source of standings. No more divergent logic in different components; fewer “matchPoints mismatch” or “wrong opponents” issues.

---

## 2. **Explicit “opponents” / “played against” (high impact for rematches)**

**Problem:** “Have these two players already played?” is answered by scanning all previous pairings. That depends on (a) having every match in `previousPairings` with correct `player1_id`/`player2_id`, and (b) the same completion rules as standings. If a match is missing or counted differently, you get wrong rematch detection and the algorithm can break (e.g. invalid pairings or “player paired more than once” / “not every player appears exactly once”).

**Recommendation:** Store opponent history in the DB so the pairer can rely on it.

**Option A – In `tournament_matches`:**  
You already have `player1_id` and `player2_id`. Ensure:

- Every **completed** match (and bye) is present and counted once.
- Use a **single ordered convention** when building “previous pairings” (e.g. always by `round_number`, then `id`), and when checking “have they played?” use a symmetric check: `(A,B) or (B,A)`.

**Option B – Dedicated table `tournament_opponents` (or “match pairs”):**

- `tournament_id`, `player_id`, `opponent_id`, `round_number` (and maybe `match_id`).
- One row per player per opponent per round (so two rows per match: A→B and B→A), or one row per pair per round with `player1_id`, `player2_id`.
- Populated when a match is completed (and for byes: no opponent row).

**Why it helps:** Rematch checks can use a single query (e.g. “has player X already played player Y in this tournament?”) instead of rebuilding from matches. Reduces risk of missing matches or inconsistent completion rules.

---

## 3. **Match completion and draw semantics (medium impact)**

**Problem:** The pairer and the UI must agree on “completed”, “bye”, and “draw”. If the DB or API hides some matches (e.g. only “completed” with a winner) or represents draws differently, standings and opponent lists will be wrong.

**Recommendation:**

- **Explicit outcome enum:** e.g. `result_type` or `outcome`: `'win' | 'draw' | 'bye'`. Keep `winner_id` NULL for draw and bye; use `result` for game score (e.g. "1-1") if needed.
- **Bye convention:** One row per bye with `player2_id` NULL and a clear status (e.g. `status = 'bye'`). Ensure every round’s matches are loaded (no filter that drops byes).
- **Idempotent updates:** When a result is set, recompute standings (or update `tournament_standings`) in one place so standings and “played against” stay in sync.

This doesn’t require new tables if you tighten the semantics of existing columns and how the frontend/backend interpret them.

---

## 4. **Integrity constraints (medium impact)**

**Problem:** Duplicate or inconsistent matches (same round, same pair, multiple rows; or same player twice in one round) can break the pairer’s invariants (“every player appears exactly once”, “no duplicate match”).

**Recommendations:**

- **Unique constraint** on `(tournament_id, round_number, player1_id, player2_id)` where `player2_id IS NOT NULL`, and a **unique constraint** on `(tournament_id, round_number, player1_id)` for the case `player2_id IS NULL` (bye). Use a partial unique index if your DB supports it:
  - One index for “pair” (player1_id, player2_id) with player1_id < player2_id to avoid (A,B) and (B,A) both being inserted.
- **Per-round uniqueness of player:** Trigger or constraint so that for a given `tournament_id` and `round_number`, each `player1_id` and each non-null `player2_id` appears at most once. That directly supports the pairer’s “no player twice in the same round” invariant.

---

## 5. **Round ordering and deterministic ordering (low–medium impact)**

**Problem:** “Previous pairings” are built from `matches.filter(round_number < nextRound)`. If rounds are not strictly ordered (e.g. round numbers have gaps or duplicates) or if the order of matches within a round is non-deterministic, the pairer can see a different “history” in different runs and rematch/float decisions can change or break.

**Recommendation:**

- **Strict round numbering:** Ensure `round_number` is 1, 2, 3, … with no gaps for “active” rounds. Optionally add a `round_index` or enforce “next round = max(round_number) + 1” when generating pairings.
- **Deterministic order when loading:** When building `previousPairings`, sort by `round_number` then a stable key (e.g. `id`):  
  `matches.filter(...).sort((a,b) => a.round_number - b.round_number || a.id.localeCompare(b.id))`.
- **DB ordering:** Use `ORDER BY round_number, id` (or `created_at`) whenever you select matches for pairing/standings so that the same ordering is used everywhere.

---

## 6. **Bye tracking (low impact if standings are correct)**

**Problem:** Bye priority is “lowest score, then fewest byes received”. If `byes_received` is derived only from matches where `player2_id IS NULL`, it must be consistent with how you count “completed” rounds. Inconsistent bye counting can change who gets the bye and can interact badly with “every player appears exactly once”.

**Recommendation:** If you add `tournament_standings`, include `byes_received` there and update it when a bye is recorded. Then the pairer can use that value directly. No new table is strictly necessary if standings are derived consistently in one place.

---

## Summary table

| Change                                                                  | Impact     | Effort                          |
| ----------------------------------------------------------------------- | ---------- | ------------------------------- |
| Materialized standings (e.g. `tournament_standings`)                    | High       | Medium                          |
| Explicit opponent history (table or strict match semantics)             | High       | Low–Medium                      |
| Clear match outcome enum + bye/draw semantics                           | Medium     | Low                             |
| Unique constraints (no duplicate pair/round, no double player in round) | Medium     | Low                             |
| Deterministic round + match ordering                                    | Low–Medium | Low                             |
| Bye tracking in standings                                               | Low        | Low (if standings table exists) |

Implementing **materialized standings** and **explicit opponent history** (or at least strict, single-place derivation and deterministic ordering) will give the biggest gain for the pairing algorithm. The constraints and ordering improvements are quick wins that reduce invalid states and non-determinism.
