# Quick script to view tournaments and their pairings
# Run this from the project root after logging in through the app

$supabaseUrl = "http://127.0.0.1:54321"
$anonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

Write-Host "`n=== Tournaments ===" -ForegroundColor Cyan
$headers = @{
    'apikey' = $anonKey
    'Authorization' = "Bearer $anonKey"
    'Content-Type' = 'application/json'
}

try {
    $tournaments = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/tournaments?select=*" -Headers $headers -Method Get
    if ($tournaments.value.Count -eq 0) {
        Write-Host "No tournaments found. Make sure you're authenticated and have created a tournament." -ForegroundColor Yellow
    } else {
        $tournaments.value | ForEach-Object {
            Write-Host "`nTournament: $($_.name)" -ForegroundColor Green
            Write-Host "  ID: $($_.id)"
            Write-Host "  Status: $($_.status)"
            Write-Host "  Type: $($_.tournament_type)"
            Write-Host "  Rounds: $($_.num_rounds)"
            
            # Get matches for this tournament
            $matches = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/tournament_matches?tournament_id=eq.$($_.id)&select=*&order=round_number.asc,created_at.asc" -Headers $headers -Method Get
            if ($matches.value.Count -gt 0) {
                Write-Host "`n  Matches:" -ForegroundColor Yellow
                $matches.value | Group-Object round_number | ForEach-Object {
                    Write-Host "    Round $($_.Name):" -ForegroundColor Magenta
                    $_.Group | ForEach-Object {
                        $match = $_
                        if ($match.player2_id) {
                            Write-Host "      $($match.player1_id) vs $($match.player2_id) - Status: $($match.status) - Result: $($match.result)"
                        } else {
                            Write-Host "      $($match.player1_id) - BYE"
                        }
                    }
                }
            } else {
                Write-Host "  No matches yet" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "`nNote: This requires authentication. Try:" -ForegroundColor Yellow
    Write-Host "1. Open http://127.0.0.1:54323 (Supabase Studio)" -ForegroundColor Yellow
    Write-Host "2. Or log in through the app first, then check the browser's network tab for the auth token" -ForegroundColor Yellow
}
