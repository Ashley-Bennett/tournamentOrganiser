import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Fade,
} from "@mui/material";
import PlayerCardEditor from "./PlayerCardEditor";
import { useMyBadges, useMyCardGames } from "../hooks/useMyBadges";
import { useMyCard } from "../hooks/useMyCard";
import { getGame } from "../games/registry";
import type { EquippedSlot } from "../badges/card";

/**
 * The card section on the account page.
 *
 * One card per game the account has actually entered an event for, and no
 * others: handing somebody a generic card to fill in when they have only ever
 * played Pokémon is offering a thing that will never be seen. An account with
 * no entries gets no section at all rather than an empty state, because there
 * is nothing to do in it yet and a locked door is worse than no door.
 *
 * Saving happens on change. There is no save button because there is nothing
 * to batch — every edit is one slot, and a button would only add a way to
 * lose the change by navigating away.
 */
export default function MyCardSection({ name }: { name: string }) {
  const { games, loading: gamesLoading } = useMyCardGames();
  const { badges, loading: badgesLoading } = useMyBadges();
  const [gameId, setGameId] = useState<string | null>(null);

  // Defaults to the most recently played, which is the card most likely to be
  // shown next.
  useEffect(() => {
    if (!gameId && games.length > 0) setGameId(games[0].game_id);
  }, [games, gameId]);

  const { loadout, loading: cardLoading, error, save } = useMyCard(gameId);

  if (gamesLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (games.length === 0) return null;

  const handleChange = (slots: EquippedSlot[]) => {
    void save({ partnerKey: loadout.partnerKey, slots });
  };

  const handlePartner = (partnerKey: string) => {
    void save({ partnerKey, slots: loadout.slots });
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Your card
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        What the room sees next to your name on the pairings.
        {games.length > 1 && " Each game has its own card."}
      </Typography>

      {/* One card per game, and the tabs only appear when there is a choice to
          make — a single tab is a label pretending to be a control. */}
      {games.length > 1 && (
        <Tabs
          value={gameId ?? false}
          onChange={(_, next: string) => setGameId(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {games.map((g) => (
            <Tab key={g.game_id} value={g.game_id} label={getGame(g.game_id).name} />
          ))}
        </Tabs>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Faded rather than replaced by a spinner: the card is already on
          screen, and swapping it for a loader on every tab change makes a
          cheap read look like a page load. */}
      <Fade in={!cardLoading && !badgesLoading}>
        <Box>
          {gameId && games.length > 1 && (
            <Typography
              variant="caption"
              sx={{ display: "block", color: "text.disabled", mb: 0.5 }}
            >
              Shown at {getGame(gameId).name} events
            </Typography>
          )}
          {gameId && (
            <PlayerCardEditor
              name={name}
              gameId={gameId}
              partnerKey={loadout.partnerKey}
              equipped={loadout.slots}
              earned={badges}
              onChange={handleChange}
              onPartnerChange={handlePartner}
            />
          )}
        </Box>
      </Fade>
    </Paper>
  );
}
