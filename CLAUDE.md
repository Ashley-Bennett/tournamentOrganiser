# Claude Instructions

## Changelog & Patch Notes Maintenance

Update **both** of the following **only when the user is ready to push a batch of commits** — not after every individual task or commit.

1. **`CHANGELOG.md`** (repo root) — developer-facing. Use [Keep a Changelog](https://keepachangelog.com) format. Include technical detail: migrations, refactors, removed code, test changes, etc.

2. **`frontend/src/data/patchNotes.ts`** — user-facing. Plain language only. No mention of migrations, tests, types, or internal refactors. Focus on what the user can see or do. Add new releases as a new object at the **top** of the array.

Both files should be updated together in a single changelog commit that covers the whole batch. Use today's actual date.

### Categories for patchNotes.ts
- `"New Features"` — brand new functionality
- `"Workspaces"` — workspace-related changes
- `"Tournaments"` — tournament/match/pairing changes
- `"Fixes & Polish"` — bug fixes and UX improvements

### Version bump rule
Increment the minor version (0.x.0) for each push batch. Patch version (0.0.x) for hotfix-only pushes.

---

## Commit Messages

After completing any meaningful task, suggest a commit message in this format:

```
<type>: <short summary>

- <bullet of what changed>
- <bullet of what changed>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`

Rules:
- Summary line: max 72 chars, lowercase, no trailing period
- Bullets: only include things that are meaningfully different, skip internal plumbing the user doesn't care about
- Do NOT auto-commit — suggest the message and let the user run it

---

## Browser Verification — Open The Pane FIRST

The Browser pane does not exist until Claude opens it, and the login lives in that
pane. If it is opened halfway through a task, there is no chance to log in before
verification is needed.

**So: if a task might need the running app, `preview_start` the `matchamp` config as
the FIRST tool call**, before reading code or planning. Say "log in if you aren't
already" in the same turn, then carry on with the code work — the login happens in
parallel and is ready by the time it is needed.

### Rules

- Use the **`matchamp`** launch config. It attaches to the dev server already running
  on **:5173** and starts nothing. Only use `matchamp-own-server` (:5199) if :5173 is
  not running — and never both at once: the Supabase session is kept in `localStorage`,
  which is per-origin, so a login on one port does not carry to the other.
- **Wait ~2s after navigating before reading the page.** `AuthContext` rehydrates the
  session asynchronously, and `RequireAuth` renders the logged-out redirect until it
  finishes. Reading immediately gives a false "logged out" result on a page that is
  about to render fine.
- Local dev points at the **local** Supabase stack (`127.0.0.1:54321`), not dev or prod.
  The database is whatever is in Docker, so it is usually near-empty.

### Verifying player-facing pages

`/stats` and the player views need a `tournament_players` row with `user_id` set —
organising a tournament is not enough. With no linked entry every stat reads 0 and the
season picker hides itself, which looks like a bug and is not one.

To check such a page, seed temporary rows named `SEASONDEMO %` (or similar marker),
screenshot, then `DELETE FROM tournaments WHERE name LIKE '<marker> %'` — the cascade
takes the players and matches with it. Never leave seed data behind, and never seed
anything but the local stack.
