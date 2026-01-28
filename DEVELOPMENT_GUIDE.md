# Development Guide

## Running the Application

### Development Mode

In development mode, the frontend and backend run on separate ports:

1. **Backend Server** (Port 3002): Handles API requests
2. **Frontend Server** (Port 5173): Handles the React application

### How to Start Development Servers

#### Option 1: Use the provided script

```bash
# Windows
scripts/dev.bat

# PowerShell
scripts/dev.ps1
```

#### Option 2: Manual start

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Accessing the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3002/api

### Important: Always Access Through Frontend URL

When developing, **always access your application through the frontend URL** (http://localhost:5173), not directly through the backend.

**Why?** The frontend uses client-side routing (React Router), which means routes like `/dashboard`, `/tournaments`, etc. are handled by the React application, not the server.

### What Happens When You Refresh

1. **Correct way**: Access http://localhost:5173/dashboard

   - Vite dev server serves the React app
   - React Router handles the `/dashboard` route
   - Page loads correctly

2. **Incorrect way**: Access http://localhost:3002/dashboard
   - Backend server receives the request
   - Backend doesn't know about frontend routes
   - Returns "Not Found" error

### Production Mode

In production, the backend serves both the API and the React application:

- All API requests go to `/api/*` routes
- All other requests serve the React app's `index.html`
- React Router handles client-side routing

### Troubleshooting

**Problem**: "Not Found" when refreshing pages
**Solution**: Make sure you're accessing the application through http://localhost:5173, not http://localhost:3002

**Problem**: API calls failing
**Solution**: Check that the backend is running on port 3002 and the frontend proxy is configured correctly

### Development Workflow

1. Start both servers using the dev script
2. Access the application at http://localhost:5173
3. Navigate to different pages using the React Router links
4. If you need to refresh, always refresh from http://localhost:5173
5. API calls will be automatically proxied to the backend
