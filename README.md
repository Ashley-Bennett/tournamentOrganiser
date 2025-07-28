# Tournament Organiser

A full-stack tournament management application built with React, TypeScript, Material-UI, Node.js, Express, and SQLite.

## 🏗️ Project Structure

```
tournamentOrganiser/
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   ├── database/       # SQLite database setup
│   │   └── index.ts        # Express server entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # React/Vite frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── App.tsx        # Main app component
│   │   └── main.tsx       # React entry point
│   ├── package.json
│   └── vite.config.ts
└── package.json           # Root workspace configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd tournamentOrganiser
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

3. **Set up environment variables**

   ```bash
   # Copy backend environment template
   cp backend/env.example backend/.env
   ```

4. **Start development servers**

   ```bash
   # Start both frontend and backend
   npm run dev

   # Or start them separately:
   npm run dev:backend  # Backend on http://localhost:3002
   npm run dev:frontend # Frontend on http://localhost:5173
   ```

## 🛠️ Development

### Backend (Node.js/Express)

- **Port**: 3002
- **Database**: SQLite (stored in `backend/data/tournament.db`)
- **Features**:
  - RESTful API endpoints
  - SQLite database with tournament, participant, and match tables
  - CORS enabled for frontend communication
  - TypeScript for type safety

### Frontend (React/Vite)

- **Port**: 5173
- **Features**:
  - React 18 with TypeScript
  - Material-UI for modern UI components
  - React Router for navigation
  - Vite for fast development and building
  - Proxy configuration for API calls

## 📊 Database Schema

### Tournaments Table

- `id` (PRIMARY KEY)
- `name` (TEXT, NOT NULL)
- `description` (TEXT)
- `start_date` (TEXT)
- `end_date` (TEXT)
- `max_participants` (INTEGER)
- `status` (TEXT, DEFAULT 'pending')
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Participants Table

- `id` (PRIMARY KEY)
- `tournament_id` (FOREIGN KEY)
- `name` (TEXT, NOT NULL)
- `email` (TEXT)
- `phone` (TEXT)
- `registration_date` (DATETIME)
- `status` (TEXT, DEFAULT 'registered')

### Matches Table

- `id` (PRIMARY KEY)
- `tournament_id` (FOREIGN KEY)
- `participant1_id` (FOREIGN KEY)
- `participant2_id` (FOREIGN KEY)
- `round` (INTEGER)
- `winner_id` (FOREIGN KEY)
- `match_date` (TEXT)
- `status` (TEXT, DEFAULT 'scheduled')
- `created_at` (DATETIME)

## 🎯 Features

### Current Features

- ✅ Tournament creation and management
- ✅ Participant registration
- ✅ Match scheduling and tracking
- ✅ Modern Material-UI interface
- ✅ Responsive design
- ✅ TypeScript for type safety

### Planned Features

- 🔄 Tournament brackets generation
- 🔄 Real-time match updates
- 🔄 Tournament statistics and analytics
- 🔄 User authentication and authorization
- 🔄 Tournament templates
- 🔄 Export/import functionality

## 🧪 API Endpoints

### Health Check

- `GET /api/health` - Server health status

### Tournaments

- `GET /api/tournaments` - Get all tournaments
- `POST /api/tournaments` - Create new tournament
- `GET /api/tournaments/:id` - Get tournament by ID
- `PUT /api/tournaments/:id` - Update tournament
- `DELETE /api/tournaments/:id` - Delete tournament

### Participants

- `GET /api/tournaments/:id/participants` - Get tournament participants
- `POST /api/tournaments/:id/participants` - Add participant to tournament

### Matches

- `GET /api/tournaments/:id/matches` - Get tournament matches
- `POST /api/tournaments/:id/matches` - Create new match
- `PUT /api/matches/:id` - Update match result

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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter any issues or have questions, please open an issue on GitHub.
