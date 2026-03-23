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
