Write-Host "🌱 Resetting and Seeding Tournament Organiser Database..." -ForegroundColor Green
Set-Location backend
npm run reset-and-seed
Write-Host ""
Write-Host "✅ Database reset and seeding completed!" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to continue" 