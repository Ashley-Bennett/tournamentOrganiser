import React, { useEffect } from "react";
import { FormControlLabel, Switch, Tooltip, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { STACK_PARAM, readStoredStack, useStackVariants } from "../hooks/useStackVariants";

/**
 * "Stack variants" switch for the stats pages.
 *
 * Slot order is always ignored, so Dragapult / Dudunsparce and Dudunsparce /
 * Dragapult are one deck either way. Stacking goes further and folds a pair
 * into its main Pokémon — the one people also play on its own — so Mega Lucario
 * and Mega Lucario / Hariyama read as one deck.
 */
export default function StackVariantsToggle() {
  const [stacked, setStacked] = useStackVariants();
  const [params] = useSearchParams();
  const hasParam = params.has(STACK_PARAM);

  // A remembered "on" is written into the URL, so a drill-down link copied
  // from this visit opens stacked for whoever it is pasted to.
  useEffect(() => {
    if (!hasParam && readStoredStack()) setStacked(true);
  }, [hasParam, setStacked]);

  return (
    <Tooltip
      title="Combine decks like Mega Lucario / Hariyama into Mega Lucario. A pair is folded into whichever of its Pokémon people also play on its own."
      placement="bottom-start"
    >
      <FormControlLabel
        sx={{ mb: 2, ml: 0 }}
        control={
          <Switch
            size="small"
            checked={stacked}
            onChange={(e) => setStacked(e.target.checked)}
          />
        }
        label={
          <Typography variant="body2" color="text.secondary">
            Stack variants
          </Typography>
        }
      />
    </Tooltip>
  );
}

/** "+2 variants" beside a stacked deck, so a folded row does not pass for a single list. */
export function VariantsHint({ count }: { count: number | null | undefined }) {
  if (count == null || count < 2) return null;
  const extra = count - 1;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
      +{extra} variant{extra === 1 ? "" : "s"}
    </Typography>
  );
}
