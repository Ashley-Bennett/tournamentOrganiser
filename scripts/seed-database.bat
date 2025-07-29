@echo off
echo 🌱 Resetting and Seeding Tournament Organiser Database...
cd backend
npm run reset-and-seed
echo.
echo ✅ Database reset and seeding completed!
echo.
pause 