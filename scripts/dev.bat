@echo off
echo Starting Tournament Organiser Development Servers...
echo.

echo Starting Backend Server (Port 3002)...
start "Backend Server" cmd /k "cd backend && npm run dev"

echo Starting Frontend Server (Port 5173)...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo Development servers are starting...
echo Backend: http://localhost:3002
echo Frontend: http://localhost:5173
echo.
echo Press any key to exit this script (servers will continue running)
pause > nul 