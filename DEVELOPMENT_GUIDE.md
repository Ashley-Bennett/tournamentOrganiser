# Development Guide

## Running the app

There is no application server. The frontend is the whole app, and it talks to
Supabase directly.

```bash
npm run dev
```

That serves the app on **http://localhost:5173**. The `predev` step refreshes
`frontend/public/pokemonList.json` from PokéAPI if it is missing or stale; it is
gitignored and fetched at runtime, so nothing else depends on it existing.

### Supabase

Local development points at the local Supabase stack on `127.0.0.1:54321`, not
dev or prod. Start it with `npx supabase start` — the database is whatever is in
Docker, so it is usually near-empty.

```bash
npx supabase start     # local stack (API 54321, DB 54322, Studio 54323)
npx supabase stop      # data survives via Docker volumes
```

If `supabase start` fails with a container name conflict, run `supabase stop`
first.

## Client-side routing

Routes like `/dashboard` and `/tournaments` are handled by React Router in the
browser, not by a server. In development the Vite dev server serves `index.html`
for any path, so refreshing a deep link works.

In production the app is a Render static site. The rewrite that sends unknown
paths to `index.html` lives in `frontend/public/_redirects`; without it, a
refresh on a deep link 404s.

## Checks

CI runs these three on every push to `dev` and `main`, and on PRs into them. Run
them locally before pushing:

```bash
npx tsc --noEmit --project frontend/tsconfig.json
npm run lint
npm test
```

## Database changes

Schema changes are migrations in `supabase/migrations/`. Test locally first,
then push to the dev project; prod is promoted as part of a release.

```bash
npx supabase db push --dry-run   # check what would apply
npx supabase db push
```

`db push` targets whichever project the CLI is currently linked to — check
`supabase/.temp/project-ref` before pushing rather than assuming.

## Troubleshooting

**A deep link 404s in production** — check `frontend/public/_redirects` is
present in the build output.

**Stats or player pages read zero** — `/stats` and the player views need a
`tournament_players` row with `user_id` set. Organising a tournament is not
enough; without a linked entry every stat reads 0 and the season picker hides
itself.
