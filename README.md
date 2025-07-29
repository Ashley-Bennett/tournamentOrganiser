# Matchamp

A full-stack tournament management application built with React, TypeScript, Material-UI, Node.js, Express, and PostgreSQL.

## 🏗️ Project Structure

```
matchamp/
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   ├── database/       # PostgreSQL database setup
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
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Features**:
  - RESTful API endpoints
  - PostgreSQL database with tournament, participant, and match tables
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
- ✅ **Automatic Swiss pairing system**
- ✅ **Static seating constraint enforcement**
- ✅ **Dynamic match result entry**
- ✅ **Real-time standings updates**

### Planned Features

- 🔄 Tournament brackets generation
- 🔄 Real-time match updates
- 🔄 Tournament statistics and analytics
- 🔄 User authentication and authorization
- 🔄 Tournament templates
- 🔄 Export/import functionality

## 🎯 Pairing System

### Automatic Pairing

The tournament organizer now supports automatic pairing for Swiss tournaments with the following features:

#### First Round Pairing

- **Static Seating Priority**: Static seating players are paired with dynamic seating players first
- **Constraint Enforcement**: Two static seating players are never paired together
- **Remaining Players**: Any remaining players are paired within their own groups
- **Bye Handling**: Odd players receive a bye

#### Subsequent Round Pairing (Swiss System)

- **Point-Based Pairing**: Players are paired based on their current tournament points
- **Previous Match Avoidance**: Players who have already played each other are not paired again
- **Static Seating Constraint**: Static seating players are never paired together
- **Optimal Matching**: Algorithm finds the best available opponent based on point difference
- **Fair Bye System**: Byes are given to the lowest scoring players and count as 1 point
- **Bye Limits**: Players are limited to 2 byes per tournament to prevent abuse

### Pairing Options

When creating matches, users can choose between:

1. **🎯 Automatic Pairing**: System automatically creates optimal pairings based on points and constraints
2. **✏️ Custom Pairing**: Manual selection of players for each match

## 🏆 Match Result System

### Dynamic Result Entry

The tournament organizer now features dynamic match result entry with the following capabilities:

#### Result Buttons

- **Player-Specific Buttons**: Each match shows three buttons with actual player names
- **Win Options**: "[Player Name] Wins" buttons for each player
- **Tie Option**: "Tie" button for draws
- **Real-time Updates**: Results update immediately and refresh standings

#### Result Validation

- **Complete Round Requirement**: Subsequent rounds cannot be created until all current round results are in
- **Visual Feedback**: Buttons are disabled during updates with loading states
- **Success Indicators**: "Result Set" chip appears when match has a result

#### Standings Updates

- **Automatic Point Calculation**: Win = 1 point, Draw = 0.5 points, Loss = 0 points, **Bye = 1 point**
- **Real-time Refresh**: Standings update immediately after result entry
- **Tournament Progress**: System tracks completion status for each round

## 🎲 Bye System

### Fair Bye Distribution

The tournament organizer implements a fair bye system to handle odd numbers of players:

#### Bye Rules

- **Point Value**: Byes count as 1 point (same as a win)
- **Distribution**: Byes are given to the lowest scoring players first
- **Limits**: Players are limited to 2 byes per tournament
- **History Tracking**: System tracks bye history to prevent abuse

#### Bye Assignment Logic

- **First Round**: Bye given to the lowest scoring player
- **Subsequent Rounds**: Byes given to lowest scoring players who haven't exceeded limits
- **Fallback**: If a player has had too many byes, system finds another eligible player

#### Benefits

- **Fairness**: Lowest scoring players get opportunities to catch up
- **Prevents Abuse**: Limits prevent players from getting too many free points
- **Tournament Integrity**: Maintains competitive balance throughout the tournament

### API Endpoints

#### Get Player Standings

```
GET /api/tournaments/:id/standings
```

Returns player standings with points, matches played, and seating type.

#### Create Automatic Pairings

```
POST /api/tournaments/:id/pairings
Body: { "round_number": number }
```

Creates automatic pairings for the specified round and returns the created matches.

#### Update Match Result

```
PATCH /api/matches/:id/result
Body: { "result": string, "winner_id": number, "modified_by_to": boolean }
```

Updates match result and automatically recalculates player standings.

### Database Schema Updates

The system now tracks:

- **Player Points**: Calculated from match results (Win = 1, Draw = 0.5, Loss = 0)
- **Static Seating**: Boolean flag indicating if a player requires fixed seating
- **Match History**: Prevents repeat pairings in Swiss tournaments
- **Result Tracking**: Complete match result history with timestamps
- **Tournament Progress**: Round completion status and validation

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
