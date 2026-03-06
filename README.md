# Matchamp — Tournament Organiser

**Matchamp** is a full-stack tournament organiser app. Create workspaces, run Swiss or single-elimination tournaments, manage players, enter match results, and share standings and pairings with participants—including public, shareable pairings pages and player claim links so competitors can link their account to their entries.

---

## Table of contents

- [Tech stack](#-tech-stack)
- [Project structure](#-project-structure)
- [Prerequisites & setup](#-prerequisites--setup)
- [Tutorial: How to use Matchamp](#-tutorial-how-to-use-matchamp)
- [Feature showcase](#-feature-showcase)
- [Deployment](#-deployment)
- [License](#-license)

---

## 🛠 Tech stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 18, TypeScript, Vite 5, React Router 6, Material-UI (MUI) 5, Supabase JS client |
| **Backend** | Node.js, Express, TypeScript (minimal API; auth and data live in Supabase) |
| **Data & auth** | **Supabase** (PostgreSQL, Auth, Row Level Security) |

The app uses **Supabase** for authentication (email/password) and all tournament data. The Express backend is a thin shell for health checks and optional legacy endpoints; the frontend talks to Supabase directly.

---

## 📁 Project structure

```
tournamentOrganiser/
├── frontend/                 # React/Vite SPA
│   ├── src/
│   │   ├── components/       # Reusable UI (Header, TournamentPageHeader, etc.)
│   │   ├── pages/            # Route pages (Tournaments, TournamentView, Me, etc.)
│   │   ├── hooks/            # useTournament, useTournamentPlayers, etc.
│   │   ├── AuthContext.tsx   # Supabase auth + profile
│   │   ├── WorkspaceContext.tsx
│   │   └── supabaseClient.ts
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # Node/Express (minimal)
│   ├── src/index.ts
│   ├── package.json
│   └── .env
├── supabase/
│   └── migrations/           # Postgres schema, RLS, functions
└── package.json              # npm workspaces (frontend, backend)
```

---

## 🚀 Prerequisites & setup

### Prerequisites

- **Node.js** v16 or higher  
- **npm** (or yarn)  
- **Supabase** — either:
  - [Supabase CLI](https://supabase.com/docs/guides/cli) for local development, or  
  - A [hosted Supabase project](https://supabase.com/dashboard)

### 1. Clone and install

```bash
git clone <repository-url>
cd tournamentOrganiser

# Install all dependencies (root + workspaces)
npm install
npm install --workspace=backend
npm install --workspace=frontend
# Or: npm run install:all
```

### 2. Supabase (required for full features)

**Option A — Local Supabase**

```bash
# From project root
npx supabase start
npx supabase db reset   # applies migrations in supabase/migrations/
```

Use the URL and anon key printed by `supabase start` (typically `http://127.0.0.1:54321` and a long key).

**Option B — Hosted Supabase**

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).  
2. Run the migrations in `supabase/migrations/` against that project (via Supabase Dashboard SQL editor or CLI link).  
3. Use the project’s **Project URL** and **anon/public** key from Settings → API.

### 3. Environment variables

**Frontend** — create or edit `frontend/.env.development`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

For a hosted project, use your project’s URL and anon key.

**Backend** (optional, for running the Express server):

```env
# backend/.env
PORT=3002
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=dev-secret-key
```

### 4. Run the app

```bash
# Start both frontend and backend
npm run dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)  
- **Backend:** [http://localhost:3002](http://localhost:3002)

Frontend-only (e.g. if you only use Supabase):

```bash
npm run dev:frontend
```

**Build for production:**

```bash
npm run build
```

---

## 📖 Tutorial: How to use Matchamp

### 1. Create an account

1. Open the app (e.g. [http://localhost:5173](http://localhost:5173)).  
2. Click **Register** and sign up with email and password.  
3. After signup you’ll see the **Welcome** screen.

### 2. Choose how you’ll use Matchamp

On **Welcome** you can:

- **Run a tournament** — go to your dashboard and create/manage events (organiser).  
- **Join or track tournaments** — go to **Me** to see your profile and tournament entries (player).  
- **Skip for now** — go to the dashboard.

You can do both organising and playing with one account.

### 3. Workspaces and dashboard

- **Workspaces** are where tournaments live (e.g. “My Club”, “Store Events”).  
- On first signup you get a **personal workspace**; you can create more from the header (**Workspace** menu → **Create workspace**).  
- **Dashboard** (`/dashboard`) redirects you to your first workspace’s tournament list:  
  `/w/<workspace-slug>/tournaments`  
- Use the **workspace switcher** in the header to change workspace or open **Settings** for the current one.

### 4. Create a tournament

1. In a workspace, open **Tournaments** and click **Create tournament**.  
2. Fill in:
   - **Name** (e.g. “Friday Night Swiss”)  
   - **Type**: **Swiss** or **Single elimination**  
   - **Public**: turn on if you want a shareable pairings page (no login).  
3. Save. You’re taken to the tournament detail page.

### 5. Add players

On the tournament view (manager only):

- **Add one player:** enter name and click Add.  
- **Bulk add:** switch to “Bulk mode” and add one name per line, then Add.  

You can add or remove players until the tournament is started.

### 6. Start the tournament

- When the player list is ready, click **Start tournament**.  
- The first round is generated (Swiss: pairings; single elimination: bracket).  
- After starting, you can still use **Matches**, **Pairings**, and **Leaderboard**.

### 7. Enter match results

1. Open **Matches** (or the “Matches” link from the tournament view).  
2. For each match, enter or confirm the result (e.g. winner, score).  
3. When results are in, you can generate the next round (Swiss) or advance the bracket (single elimination).

### 8. View pairings and leaderboard

- **Pairings** — view rounds and who plays whom; optional standings tab.  
- **Leaderboard** — tournament standings.  
- If the tournament is **public**, the **Pairings** page has a **public link** (e.g. `/public/t/<publicSlug>`). Share that link so anyone can view pairings without logging in.

### 9. Player claim links (link account to entry)

- **Managers** can generate a **claim link** for a tournament entry.  
- Send the link to the player (e.g. `/claim/<token>`).  
- When they open it and log in (or register), their account is linked to that entry.  
- They then see that tournament under **Me** → **My tournament entries**.

### 10. Invite others to your workspace

- In **Workspace settings** you can **invite** people by email and role (e.g. admin, judge, staff).  
- They receive a link like `/invite/<token>`.  
- After accepting, they appear as workspace members and can access that workspace’s tournaments according to their role.

### 11. Your profile and entries

- **Me** (`/me`) shows:
  - Your display name (editable)  
  - Workspaces you’re in (with roles)  
  - **My tournament entries** — tournaments you’re in (e.g. after claiming an entry)  
  - Pending **workspace invites**  

You can open **Me** from the header to switch between “organiser” and “player” views.

---

## ✨ Feature showcase

### Authentication & onboarding

- **Email/password** sign up and login via Supabase Auth.  
- **Welcome** screen after signup: choose “Run a tournament” or “Join or track tournaments”, or skip.  
- **Profile** in `public.profiles` (e.g. display name, onboarding intent, default workspace).

### Workspaces

- **Workspaces** as the main tenant: each workspace has a name, slug, and type (personal / club / store).  
- **Workspace memberships** with roles: **owner**, **admin**, **judge**, **staff**.  
- **Personal workspace** created automatically on signup.  
- **Create workspace** at `/workspaces/new`.  
- **Workspace settings** at `/w/:workspaceSlug/settings` (name, slug, invites).  
- **Workspace switcher** in the header (current workspace, switch, “All workspaces”, create, settings).  
- **Invites**: invite by email and role; accept via `/invite/:token`.

### Tournaments

- **List** at `/w/:workspaceSlug/tournaments` — filter by status/name, create, delete (with confirmation).  
- **Create** at `/w/:workspaceSlug/tournaments/create` — name, type (Swiss / single elimination), public toggle.  
- **Tournament view** at `/w/:workspaceSlug/tournaments/:id`:
  - Add/remove players (single or bulk).  
  - Start tournament.  
  - Links to **Matches**, **Pairings**, **Leaderboard**.  
  - Manager-only: claim links, static seating, pairings link.  

### Matches & pairings

- **Matches** at `/w/:workspaceSlug/tournaments/:id/matches` — enter or confirm match results.  
- **Pairings** at `/w/:workspaceSlug/tournaments/:id/pairings` — view pairings by round; optional standings tab.  
- **Public pairings** at `/public/t/:publicSlug` — same view, no login; requires tournament to be public and have a `public_slug`.

### Leaderboard & standings

- **Leaderboard** at `/w/:workspaceSlug/tournaments/:id/leaderboard` — tournament standings.

### Player–user linking

- **Claim player** at `/claim/:token` — link the logged-in user to a tournament entry (RPC `accept_player_claim_link`); redirect to **Me**.  
- **My tournament entries** on **Me** — list of tournaments the user is in (e.g. after claiming).

### Roles and permissions

- **Manager** = owner or admin: create tournaments, add players, start tournament, generate claim links, manage pairings, workspace settings.  
- **Judge / staff** and non-members see reduced or read-only access according to RLS and UI.

### Dashboard

- **Dashboard** at `/w/:workspaceSlug/dashboard` — stats such as active tournaments, total participants, completed tournaments.  
- **Dashboard** at `/dashboard` redirects to the first workspace’s tournaments.

---

## 🚀 Deployment

### Backend

```bash
cd backend
npm run build
# Set NODE_ENV=production and env vars, then:
node dist/index.js
# Or use your preferred process manager (e.g. PM2)
```

### Frontend

```bash
cd frontend
npm run build
# Serve the contents of dist/ with your web server (e.g. Nginx, Vercel, Netlify).
# Set VITE_SUPABASE_* to your production Supabase project.
```

### Supabase

- Use a **hosted Supabase project** for production.  
- Apply all migrations in `supabase/migrations/` to that project.  
- Configure Auth (e.g. redirect URLs, email templates) in the Supabase Dashboard.  
- Point the frontend env vars to the production project URL and anon key.

---

## 📝 License

This project is licensed under the MIT License.
