# Deployment

The app deploys to Render as a **single static site**. There is no application
server — auth and all data go directly to Supabase, and anything needing
privileged access is a `SECURITY DEFINER` Postgres function or a Supabase edge
function.

`render.yaml` is the source of truth; the settings below are what it declares.

## Render service

| Setting | Value |
|---|---|
| Type | Static Site |
| Name | `tournament-organizer-frontend` |
| Build command | `cd frontend && npm install && npm run build` |
| Publish directory | `frontend/dist` |

### Build environment variables

Set these in the Render dashboard — they are baked into the bundle at build
time, so a change needs a rebuild, not just a restart.

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

The anon key is publishable by design; it is safe in the bundle because every
table is protected by Row Level Security. Never put the service role key here.

### Files that matter in the build

- `frontend/public/_redirects` — `/* /index.html 200`. Without it, refreshing a
  deep link like `/tournaments/abc` returns 404, because React Router handles
  those paths in the browser.
- `frontend/public/_headers` — CSP and other security headers. Adding a new
  external origin (font host, image CDN, API) means updating the CSP here or the
  browser blocks it silently.

## Database

Migrations are promoted separately from the frontend, and the order matters.

```bash
npx supabase db push --dry-run   # confirm what would apply
npx supabase db push             # targets the LINKED project
```

`db push` has no per-command project flag — it targets whatever
`supabase/.temp/project-ref` points at. Check it before pushing, and relink back
to dev afterwards if you pushed to prod.

**Ship migrations and the frontend in the same window when a migration is not
backward compatible.** Dropping or changing an RPC signature breaks the deployed
bundle the moment it lands, and shipping the frontend first breaks it until the
migration arrives.

## Free tier

Render's free static sites do not sleep, but the Supabase free project pauses
after inactivity — the `keep-supabase-alive` workflow pings it every 5 days to
prevent that.

## Local production build

```bash
cd frontend
npm run build
npm run preview
```
