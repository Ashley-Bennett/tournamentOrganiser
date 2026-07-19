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

2. **Opponents' Win Percentage** (OMW%) — handbook §5.3.3
   - Average of the win percentages of all opponents played
   - An opponent's win percentage = wins ÷ rounds played
     - Ties count as rounds played but contribute **zero** wins (not half)
     - Rounds in which the opponent received a bye are **excluded entirely**
       (a bye counts as a win for match points but not for tiebreakers)
   - Minimum win percentage: **25%**
   - Maximum win percentage: **100%** if the opponent completed the event,
     **75%** if the opponent dropped before it finished

3. **Opponents' Opponents' Win Percentage** (OOMW%)
   - Average of the OMW% of all the player's opponents
   - Used when OMW% is tied

4. **Head-to-Head** — handbook §5.5.1.1
   - Applies only when **exactly two** players remain tied after the
     percentage tiebreakers and they played each other during the event;
     the winner of that match ranks higher
   - Ties among three or more players (or two who never met) are ordered
     randomly per the handbook; this app uses a deterministic name sort instead

## Implementation Notes

- All pairing and tie-breaking logic should follow the official handbook
- When in doubt, refer to the PDF document linked above
- The handbook was last updated January 1, 2026 for the 2025 Championship Series

## Resources

- Official Handbook: https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf
- Play! Pokémon Resources: https://play.pokemon.com/en-us/resources/documents/play-pokemon-tournament-rules-handbook/
