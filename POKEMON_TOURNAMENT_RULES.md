# Pokemon Tournament Rules Reference

This document references the official [Play! Pokémon Tournament Rules Handbook](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf) for matching and tie-breaking procedures.

## Key Sections to Reference

- **Section 5.3**: Match Records & Ranking
- **Section 5.6**: Pairings
- **Section 5.5**: Tournament Styles

## Swiss Pairing Rules (Based on Pokemon Tournament Standards)

### First Round

- Random pairing of all players

### Subsequent Rounds

1. **Score Groups**: Players are grouped by match points (wins)
2. **Pairing Within Groups**:
   - Pair highest vs highest within each score group
   - Avoid rematches (players who have already played each other)
   - If odd number in group, pair with next highest score group
3. **Bye Handling**:
   - If odd number of players, lowest-ranked player receives a bye
   - Bye counts as a win (3 points)

## Tie-Breaking Criteria

The following tie-breakers are used in order:

1. **Match Points** (Primary)
   - Win = 3 points
   - Bye = 3 points (equivalent to a win)
   - Draw/Tie = 1 point
   - Loss = 0 points

2. **Opponent's Match Win Percentage** (OMW%)
   - Average win percentage of all opponents played
   - Formula: Sum of (opponent wins / opponent matches) / number of opponents

3. **Opponent's Opponent's Match Win Percentage** (OOMW%)
   - Average win percentage of opponents' opponents
   - Used when OMW% is tied

4. **Head-to-Head** (if applicable)
   - Direct match result between tied players

## Implementation Notes

- All pairing and tie-breaking logic should follow the official handbook
- When in doubt, refer to the PDF document linked above
- The handbook was last updated January 1, 2026 for the 2025 Championship Series

## Resources

- Official Handbook: https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf
- Play! Pokémon Resources: https://play.pokemon.com/en-us/resources/documents/play-pokemon-tournament-rules-handbook/
