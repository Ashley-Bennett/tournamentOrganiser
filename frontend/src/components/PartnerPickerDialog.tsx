import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import PickerDialog, { type PickerItem } from "./PickerDialog";
import { getPokemonList } from "../utils/pokemonCache";
import { partnerImage, partnerOptions, partnerSourceFor } from "../games/partners";

/**
 * Choosing a partner.
 *
 * Two shapes behind one dialog: a declared set is eight vectors and needs no
 * loading, and Pokémon is every species, which does. Both are the same list
 * with the same search, because the difference is where the rows come from and
 * not what picking one means.
 *
 * The row art is the artwork the card will draw, not a second rendering of it.
 * Picking one picture and being given another is the thing this is built to
 * avoid.
 */

const ROW_PX = 32;

function rowIcon(src: string) {
  return (
    <Box
      component="img"
      src={src}
      alt=""
      sx={{ width: ROW_PX, height: ROW_PX, objectFit: "contain", mr: 1.5 }}
    />
  );
}

export default function PartnerPickerDialog({
  open,
  gameId,
  partnerKey,
  onPick,
  onClose,
}: {
  open: boolean;
  gameId: string | null;
  partnerKey: string | null;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const source = partnerSourceFor(gameId);
  const [species, setSpecies] = useState<PickerItem[]>([]);

  // Only fetched once the dialog is actually opened on a Pokémon card: the
  // species list is large, and an account page should not pay for it to sit
  // behind a button nobody pressed.
  useEffect(() => {
    if (!open || source.kind !== "pokemon") return;
    let stale = false;
    void getPokemonList().then((list) => {
      if (stale) return;
      setSpecies(
        list.map((p) => ({
          id: String(p.id),
          label: p.name,
          // The card's artwork, not the small list sprite. Picking one picture
          // and being handed another is the whole thing this avoids, and the
          // dialog only renders a page of rows at a time, so the size of the
          // full species list is not what is being loaded.
          icon: rowIcon(partnerImage(gameId, String(p.id)) ?? ""),
          keywords: String(p.id),
        })),
      );
    });
    return () => {
      stale = true;
    };
  }, [open, source.kind, gameId]);

  const items: PickerItem[] =
    source.kind === "pokemon"
      ? species
      : partnerOptions(gameId).map((o) => ({
          id: o.key,
          label: o.name,
          icon: rowIcon(o.src),
        }));

  return (
    <PickerDialog
      open={open && source.kind !== "none"}
      title="Choose a partner"
      items={items}
      selected={partnerKey ? [partnerKey] : []}
      multi={false}
      searchPlaceholder={
        source.kind === "pokemon" ? "Search Pokémon" : "Search partners"
      }
      itemNoun="partner"
      onApply={(ids) => {
        if (ids[0]) onPick(ids[0]);
      }}
      onClose={onClose}
    />
  );
}
