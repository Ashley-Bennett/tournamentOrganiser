import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  ButtonBase,
  LinearProgress,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import BackIcon from "@mui/icons-material/ArrowBackIosNew";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import BadgeMark from "../components/BadgeMark";
import { useMyBadges, useMyCardGames } from "../hooks/useMyBadges";
import {
  caseRows,
  leaguesFrom,
  type CaseRow,
  type CaseScope,
} from "../badges/badgeCase";
import { explanationFor } from "../badges/tiers";
import { TIERS } from "../badges/registry";
import { getGame } from "../games/registry";

/**
 * The badge wall.
 *
 * A grid rather than the list in the editor, because the two answer different
 * questions. The list beside a card is "which of these do I want on", scanned
 * while thinking about something else. This page is the catalogue itself: the
 * art at a size worth looking at, everything in view at once, and one tap to
 * find out what any of it means.
 *
 * The page is about one game — it arrives already chosen, because the card
 * this was opened from was for that game. So the tabs are free to answer the
 * question a catalogue actually raises: where does this come from. Anywhere
 * first, holding the badges that are the same whoever ran the event, then one
 * tab per club, holding the ones that carry its name. "Regular" means
 * something different at each club, and one flat list made the same badge look
 * like three.
 *
 * Locked badges are shown, dimmed. Hiding them would make the page a mirror of
 * what somebody already has and answer nothing — the point of a catalogue is
 * the part you have not got to yet. Nothing here counts how far off they are
 * in aggregate: a completion score would turn a wall into a chore list.
 */

/** The tab value for badges that belong to no club. */
const ANYWHERE = "anywhere";

const CELL_PX = 84;

function Cell({ row, onOpen }: { row: CaseRow; onOpen: () => void }) {
  return (
    <ButtonBase
      onClick={onOpen}
      aria-label={row.held ? row.label : `${row.label} — not yet earned`}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.75,
        p: 1,
        borderRadius: 2,
        width: "100%",
        // The whole cell fades, art included, so a locked badge reads as one
        // quiet thing rather than bright art beside grey words.
        opacity: row.held ? 1 : 0.35,
        transition: "opacity .15s, background-color .15s",
        "&:hover": {
          bgcolor: "action.hover",
          opacity: row.held ? 1 : 0.55,
        },
      }}
    >
      <BadgeMark
        badge={row.badge}
        tier={row.tier}
        title={row.title}
        count={row.held ? row.count : undefined}
        size={CELL_PX * 0.62}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.2,
          // Two lines, then ellipsis: a long title must not make its cell
          // taller than the rest of the row.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {row.title}
      </Typography>
    </ButtonBase>
  );
}

function Detail({ row, onClose }: { row: CaseRow | null; onClose: () => void }) {
  if (!row) return null;

  const ladder = row.badge.thresholds;
  const reachedIndex = row.tier ? TIERS.findIndex((t) => t.id === row.tier?.id) : -1;
  const progress =
    row.next && ladder.length > 0
      ? Math.min(100, Math.round((row.count / (row.count + row.next.needed)) * 100))
      : null;

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {row.label}
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
          <BadgeMark
            badge={row.badge}
            tier={row.tier}
            title={row.title}
            count={row.held ? row.count : undefined}
            size={72}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2">
              {explanationFor(row.badge, row.held ? row.count : 0)}
            </Typography>
            {!row.held && (
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                Not yet earned
              </Typography>
            )}
          </Box>
        </Box>

        {progress !== null && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                // A neutral track, not the tinted one MUI derives from the
                // primary colour: at this size on a dark ground that tint
                // reads as a filled bar, so a badge at zero looked finished.
                bgcolor: "action.selected",
                "& .MuiLinearProgress-bar": { borderRadius: 3 },
              }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {row.next?.needed} more to {row.next?.tier.label}
            </Typography>
          </Box>
        )}

        {/* The whole ladder, so somebody can see where this goes rather than
            only the next step. Reached rungs are lit; the rest are not. */}
        {ladder.length > 0 && (
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", display: "block" }}
            >
              Ranks
            </Typography>
            {ladder.map((threshold, i) => {
              const tier = TIERS[i];
              const reached = i <= reachedIndex;
              return (
                <Box
                  key={tier?.id ?? i}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: 0.5,
                    opacity: reached ? 1 : 0.4,
                  }}
                >
                  <BadgeMark
                    badge={row.badge}
                    tier={tier ?? null}
                    title={row.badge.tierTitles?.[i] ?? row.badge.title}
                    size={26}
                  />
                  <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                    {row.badge.tierTitles?.[i] ?? tier?.label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {threshold}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Badges() {
  const { games, loading: gamesLoading } = useMyCardGames();
  const { badges, loading: badgesLoading, error } = useMyBadges();

  /**
   * The open badge and the chosen game both live in the URL rather than in
   * state, the same way the stats drill-down works. That is what lets a
   * notification say "this one" — `?badge=champion&game=pokemon` opens the
   * page with that badge already explained — and it makes the back button
   * close the dialog rather than leave the page.
   */
  const [params, setParams] = useSearchParams();
  const openId = params.get("badge");
  const gameParam = params.get("game");
  const leagueParam = params.get("league");

  const [fallbackGame, setFallbackGame] = useState<string | null>(null);
  useEffect(() => {
    if (!fallbackGame && games.length > 0) setFallbackGame(games[0].game_id);
  }, [games, fallbackGame]);

  // A game named in the URL wins, but only if the account actually plays it —
  // a stale link should not strand somebody on an empty tab.
  const gameId =
    gameParam && games.some((g) => g.game_id === gameParam)
      ? gameParam
      : fallbackGame;

  const leagues = leaguesFrom(badges, gameId);

  // A league named in the URL wins, but only one the player actually has
  // badges at — a stale link should not strand somebody on an empty club.
  const league =
    leagueParam && leagues.some((l) => l.workspaceId === leagueParam)
      ? leagueParam
      : null;
  const tab = league ?? ANYWHERE;

  const scope: CaseScope = league
    ? { kind: "league", workspaceId: league }
    : { kind: "system" };

  const rows = caseRows(badges, gameId, scope);
  const open = rows.find((r) => r.badge.id === openId) ?? null;

  const show = (row: CaseRow | null) => {
    const next = new URLSearchParams(params);
    if (row) next.set("badge", row.badge.id);
    else next.delete("badge");
    // Replace rather than push: opening and closing a few badges should not
    // bury the page the player came from under a stack of history.
    setParams(next, { replace: true });
  };

  const chooseGame = (next: string) => {
    const q = new URLSearchParams(params);
    q.set("game", next);
    // Both the open badge and the club belong to the game being left: a club
    // is only a club for the games it runs.
    q.delete("badge");
    q.delete("league");
    setParams(q, { replace: true });
    setFallbackGame(next);
  };

  const chooseTab = (next: string) => {
    const q = new URLSearchParams(params);
    if (next === ANYWHERE) q.delete("league");
    else q.set("league", next);
    // The open badge belongs to the tab it was opened on.
    q.delete("badge");
    setParams(q, { replace: true });
  };

  return (
    // width:100% is load-bearing: the app's Container is a flex parent, so
    // without it the page shrinks to its content and the wall ends up four
    // cells wide on a desktop.
    <Box sx={{ width: "100%", maxWidth: 900, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Button
        component={RouterLink}
        to="/me"
        startIcon={<BackIcon sx={{ fontSize: 14 }} />}
        size="small"
        sx={{ ml: -1, mb: 1 }}
      >
        Account
      </Button>

      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Badges
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Everything there is to earn at {gameId ? getGame(gameId).name : "your"}{" "}
        events. Three go on your card at a time.
      </Typography>

      {/* The game is the page's subject rather than one of its tabs — it
          arrived already chosen from the card. It still has to be changeable
          for somebody who came here directly, so it sits under the sentence
          that names it rather than competing with the tabs below. */}
      {games.length > 1 && (
        <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
          {games.map((g) => (
            <Button
              key={g.game_id}
              size="small"
              onClick={() => chooseGame(g.game_id)}
              variant={g.game_id === gameId ? "outlined" : "text"}
              sx={{
                textTransform: "none",
                color: g.game_id === gameId ? "text.primary" : "text.secondary",
              }}
            >
              {getGame(g.game_id).name}
            </Button>
          ))}
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Anywhere first, then a tab per club. A player with no club badges yet
          sees no tabs at all, because one tab is a label pretending to be a
          control. */}
      {leagues.length > 0 && (
        <Tabs
          value={tab}
          onChange={(_, next: string) => chooseTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mt: 2, mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value={ANYWHERE} label="Anywhere" />
          {leagues.map((l) => (
            <Tab key={l.workspaceId} value={l.workspaceId} label={l.name} />
          ))}
        </Tabs>
      )}

      {gamesLoading || badgesLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            // Four across on a phone, filling out on wider screens. The wall
            // is the point, so cells stay small enough to see many at once.
            gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_PX}px, 1fr))`,
            gap: 0.5,
          }}
        >
          {rows.map((row) => (
            <Cell key={row.badge.id} row={row} onOpen={() => show(row)} />
          ))}
        </Box>
      )}

      <Detail row={open} onClose={() => show(null)} />
    </Box>
  );
}
