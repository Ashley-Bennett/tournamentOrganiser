import React, { useMemo, useState } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import StyleIcon from "@mui/icons-material/Style";
import PickerDialog, { type PickerItem } from "./PickerDialog";
import { getArtworkUrl } from "../utils/pokemonCache";
import { deckKey, deckName, type DeckRef } from "../utils/deck";

/**
 * Deck filter for the stats pages — one deck, or all of them.
 *
 * Not to be confused with `DeckPicker`, which is the two-slot Pokémon chooser
 * used when registering for a tournament. This one filters existing stats by a
 * deck the player has already used.
 *
 * It was a row of chips, one per deck. A player two seasons in has a couple of
 * dozen, which pushed the section it was filtering off the screen, so it uses
 * the same dialog the event picker does.
 *
 * "All decks" is a real entry in the list rather than a separate button, so
 * clearing the filter is the same gesture as changing it.
 */

export interface DeckFilterOption extends DeckRef {
  /** Shown as the muted second line, e.g. "6 tournaments · 64%". */
  secondary?: string;
}

const ALL_DECKS = "__all__";

function DeckAvatar({ id }: { id: number }) {
  return (
    <img
      src={getArtworkUrl(id)}
      alt=""
      style={{ width: 24, height: 24, objectFit: "contain", borderRadius: "50%" }}
    />
  );
}

export default function StatsDeckFilter<T extends DeckFilterOption>({
  decks,
  selected,
  nameMap,
  onChange,
}: {
  decks: T[];
  /** null means "all decks". */
  selected: T | null;
  nameMap: Map<number, string>;
  onChange: (deck: T | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const items: PickerItem[] = useMemo(
    () => [
      { id: ALL_DECKS, label: "All decks", secondary: "No deck filter" },
      ...decks.map((d) => ({
        id: deckKey(d),
        label: deckName(d, nameMap),
        secondary: d.secondary,
        icon: d.deck_pokemon1 != null ? <DeckAvatar id={d.deck_pokemon1} /> : undefined,
      })),
    ],
    [decks, nameMap],
  );

  if (decks.length === 0) return null;

  const selectedId = selected ? deckKey(selected) : ALL_DECKS;

  function apply(ids: string[]) {
    const id = ids[0];
    onChange(id === ALL_DECKS ? null : (decks.find((d) => deckKey(d) === id) ?? null));
  }

  return (
    <Box display="flex" flexWrap="wrap" gap={1} alignItems="center" mb={2}>
      <Button size="small" variant="outlined" startIcon={<StyleIcon />} onClick={() => setOpen(true)}>
        {selected ? "Change deck" : "Filter by deck"}
      </Button>

      {selected ? (
        <Chip
          size="small"
          avatar={
            selected.deck_pokemon1 != null ? <DeckAvatar id={selected.deck_pokemon1} /> : undefined
          }
          label={deckName(selected, nameMap)}
          onDelete={() => onChange(null)}
        />
      ) : (
        <Typography variant="body2" color="text.secondary">
          All decks
        </Typography>
      )}

      <PickerDialog
        open={open}
        title="Filter by deck"
        items={items}
        selected={[selectedId]}
        multi={false}
        searchPlaceholder="Search decks"
        onApply={apply}
        onClose={() => setOpen(false)}
      />
    </Box>
  );
}
