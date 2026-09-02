import React, { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Breadcrumbs,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import DeckDetailView from "./DeckDetailView";
import PlayerDetailView from "./PlayerDetailView";
import {
  DRILL_PARAM,
  parseDrill,
  pushView,
  playerNameFromKey,
  serialiseDrill,
  type DetailView,
} from "../utils/statsDrill";
import { deckLabel } from "../utils/statsFormat";
import { DrillContext } from "../hooks/useStatsDrill";

/**
 * One dialog for every stats drill-down, holding a view stack rather than
 * opening a dialog per step.
 *
 * A deck opens its pilots, a pilot opens their decks and opponents, an opponent
 * opens theirs — the chain has no end, so stacking dialogs would grow without
 * bound and leave the back gesture ambiguous. Here the chrome stays constant
 * and only the contents change.
 *
 * The stack lives in the query string, so browser and Android back pop it for
 * free and a drill-down is a link that can be pasted into a club chat.
 */

export function StatsDrillProvider({
  workspaceId,
  gameId,
  nameMap,
  /** Event scope for deck views opened from the meta share table. */
  deckTournamentIds,
  children,
}: {
  workspaceId: string;
  gameId: string | null;
  nameMap: Map<number, string>;
  deckTournamentIds: string[];
  children: React.ReactNode;
}) {
  const theme = useTheme();
  // Same convention as PickerDialog and PlayerIdentityDialog: a drill-down has
  // three tables in it, and an inset dialog wastes the width they need.
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [params, setParams] = useSearchParams();
  const [labels, setLabels] = useState<Record<string, string>>({});

  const stack = useMemo(
    () => parseDrill(params.get(DRILL_PARAM)),
    [params],
  );

  const setStack = useCallback(
    (next: DetailView[]) => {
      const serialised = serialiseDrill(next);
      const updated = new URLSearchParams(params);
      if (serialised === null) updated.delete(DRILL_PARAM);
      else updated.set(DRILL_PARAM, serialised);
      // A push is a history entry, so back pops one step rather than leaving
      // the page entirely.
      setParams(updated);
    },
    [params, setParams],
  );

  const open = useCallback(
    (view: DetailView) => setStack(pushView(stack, view)),
    [stack, setStack],
  );

  const close = useCallback(() => setStack([]), [setStack]);
  const truncateTo = useCallback(
    (index: number) => setStack(stack.slice(0, index + 1)),
    [stack, setStack],
  );

  const active = stack[stack.length - 1] ?? null;

  const keyOf = (v: DetailView) =>
    v.kind === "deck"
      ? `deck:${v.p1}-${v.p2}:${v.scoped}`
      : `player:${v.identityKey}`;

  // Cached from the view itself once it has loaded; otherwise derived, so a
  // pasted link still shows a real trail rather than "Player / Deck".
  const labelFor = (v: DetailView) => {
    const known = labels[keyOf(v)];
    if (known) return known;
    if (v.kind === "deck") return deckLabel(v.p1, v.p2, nameMap);
    return playerNameFromKey(v.identityKey) ?? "Player";
  };

  const rememberLabel = useCallback((view: DetailView, label: string) => {
    const k = keyOf(view);
    setLabels((prev) => (prev[k] === label ? prev : { ...prev, [k]: label }));
  }, []);

  return (
    <DrillContext.Provider value={{ open }}>
      {children}

      <Dialog
        open={active != null}
        onClose={close}
        fullScreen={fullScreen}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6, display: "flex", alignItems: "center", gap: 1 }}>
          {stack.length > 1 && (
            <IconButton
              size="small"
              aria-label="Back"
              onClick={() => truncateTo(stack.length - 2)}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}

          <Breadcrumbs
            maxItems={3}
            itemsAfterCollapse={2}
            aria-label="Drill-down history"
            sx={{ flex: 1, minWidth: 0 }}
          >
            {stack.map((view, i) =>
              i === stack.length - 1 ? (
                <Typography key={i} variant="subtitle1" fontWeight={700} noWrap>
                  {labelFor(view)}
                </Typography>
              ) : (
                <Link
                  key={i}
                  component="button"
                  underline="hover"
                  color="inherit"
                  onClick={() => truncateTo(i)}
                  sx={{ font: "inherit" }}
                >
                  {labelFor(view)}
                </Link>
              ),
            )}
          </Breadcrumbs>

          <IconButton
            onClick={close}
            aria-label="Close"
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {active?.kind === "deck" && (
            <DeckDetailView
              // Remounts on every step, so a drill back to a different deck
              // never shows the previous one's rows while loading.
              key={keyOf(active)}
              workspaceId={workspaceId}
              gameId={gameId}
              deck={{ deck_pokemon1: active.p1, deck_pokemon2: active.p2 }}
              tournamentIds={active.scoped ? deckTournamentIds : null}
              nameMap={nameMap}
              onOpen={open}
              onLabel={(l) => rememberLabel(active, l)}
            />
          )}

          {active?.kind === "player" && (
            <PlayerDetailView
              key={keyOf(active)}
              workspaceId={workspaceId}
              gameId={gameId}
              identityKey={active.identityKey}
              nameMap={nameMap}
              onOpen={open}
              onLabel={(l) => rememberLabel(active, l)}
            />
          )}

          <Box pb={1} />
        </DialogContent>
      </Dialog>
    </DrillContext.Provider>
  );
}
