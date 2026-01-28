# Matchamp (stripped-down demo)

A minimal React + Node/Express app with the tournament logic and database removed, kept only as a simple shell so the frontend and basic auth flow can run without any persistence.

## 🏗️ Project Structure

```
matchamp/
├── backend/                 # Node.js/Express backend (no database)
│   ├── src/
│   │   └── index.ts         # Express server entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/                # React/Vite frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── App.tsx          # Main app component
│   │   └── main.tsx         # React entry point
│   ├── package.json
│   └── vite.config.ts
└── package.json             # Root workspace configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd matchamp
   ```

2. **Install dependencies**

   ```bash
   # Install root dependencies
   npm install

   # Install backend dependencies
   npm install --workspace=backend

   # Install frontend dependencies
   npm install --workspace=frontend
   ```

3. **Environment**

   The backend no longer uses a database. The only important env variable is an optional `JWT_SECRET` for signing demo tokens:

   ```bash
   # backend/.env
   PORT=3002
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   JWT_SECRET=dev-secret-key
   ```

4. **Start development servers**

   ```bash
   # Start both frontend and backend
   npm run dev

   # Or start them separately:
   npm run dev:backend  # Backend on http://localhost:3002
   npm run dev:frontend # Frontend on http://localhost:5173
   ```

## 🛠️ Backend (Node.js/Express, no DB)

- **Port**: 3002 (or `PORT` env)
- **Endpoints**:
  - `GET /api/health` – returns a simple health JSON.
  - `GET /api` – returns basic API info, noting that the database is disabled.
  - `POST /api/users` – accepts `name`, `email`, `password` and returns a success message without storing anything.
  - `POST /api/login` – accepts `email`, `password` and returns a dummy JWT so the frontend can treat the user as logged in.
  - Any other `/api/*` routes respond with `501` to indicate that the old database-backed features are disabled in this build.

## 🛠️ Frontend (React/Vite)

- **Port**: 5173
- Uses React, TypeScript, Material-UI, and React Router.
- Continues to call the backend for `/api/login` and `/api/users`, but no data is persisted.

## 🚀 Deployment

### Backend Deployment

```bash
cd backend
npm run build
npm start
```

### Frontend Deployment

```bash
cd frontend
npm run build
# Serve the dist folder with your preferred web server
```

## 📝 License

This project is licensed under the MIT License.
