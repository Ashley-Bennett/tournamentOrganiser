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
  hasClosedSets,
  leaguesFrom,
  type CaseRow,
} from "../badges/badgeCase";
import { explanationFor } from "../badges/tiers";
import { TIERS } from "../badges/registry";
import { getGame } from "../games/registry";
import CollapsibleSection from "../components/CollapsibleSection";

/**
 * The badge wall.
 *
 * A grid rather than the list in the editor, because the two answer different
 * questions. The list beside a card is "which of these do I want on", scanned
 * while thinking about something else. This page is the catalogue itself: the
 * art at a size worth looking at, everything in view at once, and one tap to
 * find out what any of it means.
 *
 * The page is about one game. It arrives already chosen, because the card this
 * was opened from was for that game — there is deliberately no game picker
 * here, since being asked again for something already decided is the kind of
 * question a screen should answer for itself.
 *
 * The page is then one section per provenance, collapsible in the same shape
 * the stats page uses: badges anybody can go and earn tonight, closed sets
 * nobody can join any more, and the league section where each club keeps its
 * own — with a tab per club inside it, because "Regular" means something
 * different at each and one flat list made the same badge look like three.
 *
 * Sections rather than tabs because these are not alternatives to choose
 * between. A player wants to see what they have; the collapse is for when the
 * catalogue is long, not to hide two thirds of it behind a choice.
 *
 * Locked badges are shown, dimmed. Hiding them would make the page a mirror of
 * what somebody already has and answer nothing — the point of a catalogue is
 * the part you have not got to yet. Nothing here counts how far off they are
 * in aggregate: a completion score would turn a wall into a chore list.
 */

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

function Detail({
  row,
  onClose,
}: {
  row: CaseRow | null;
  onClose: () => void;
}) {
  if (!row) return null;

  const ladder = row.badge.thresholds;
  const reachedIndex = row.tier
    ? TIERS.findIndex((t) => t.id === row.tier?.id)
    : -1;
  const progress =
    row.next && ladder.length > 0
      ? Math.min(
          100,
          Math.round((row.count / (row.count + row.next.needed)) * 100),
        )
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
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
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

/**
 * The count shown beside a heading, visible while collapsed.
 *
 * With the denominator: a badge case is a thing you fill, and how much is
 * left is the question somebody opens it with. It is only honest because
 * every section is a closed set — the whole catalogue for that provenance is
 * on the shelf, locked ones included — so the total is a real target rather
 * than a moving one.
 */
function collectedSummary(rows: CaseRow[]): string | undefined {
  if (rows.length === 0) return undefined;
  const held = rows.filter((r) => r.held).length;
  return `${held}/${rows.length} collected`;
}

/** A grid of badges, at a size worth looking at. */
function Wall({
  rows,
  onOpen,
}: {
  rows: CaseRow[];
  onOpen: (row: CaseRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.disabled", py: 1 }}>
        Nothing here yet.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        // Four across on a phone, filling out on wider screens. The wall is
        // the point, so cells stay small enough to see many at once.
        gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_PX}px, 1fr))`,
        gap: 0.5,
      }}
    >
      {rows.map((row) => (
        <Cell key={row.badge.id} row={row} onOpen={() => onOpen(row)} />
      ))}
    </Box>
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

  // A game named in the URL wins, but only if the account actually plays it —
  // a stale link should not strand somebody on an empty page. Everything else
  // falls back to the most recently played, which is all somebody arriving
  // here directly can be assumed to mean.
  const gameId =
    gameParam && games.some((g) => g.game_id === gameParam)
      ? gameParam
      : (games[0]?.game_id ?? null);

  const leagues = leaguesFrom(badges, gameId);
  const closedShelf = hasClosedSets();

  // A league named in the URL wins, but only one the player actually has
  // badges at — a stale link should not strand somebody on an empty club.
  const league =
    leagueParam && leagues.some((l) => l.workspaceId === leagueParam)
      ? leagueParam
      : (leagues[0]?.workspaceId ?? null);

  const systemRows = caseRows(badges, gameId, { kind: "system" });
  const closedRows = closedShelf
    ? caseRows(badges, gameId, { kind: "closed" })
    : [];
  const leagueRows = league
    ? caseRows(badges, gameId, { kind: "league", workspaceId: league })
    : [];

  // Searched across every section, because a notification names a badge
  // without knowing which shelf it ended up on.
  const open =
    [...systemRows, ...closedRows, ...leagueRows].find(
      (r) => r.badge.id === openId,
    ) ?? null;

  const show = (row: CaseRow | null) => {
    const next = new URLSearchParams(params);
    if (row) next.set("badge", row.badge.id);
    else next.delete("badge");
    // Replace rather than push: opening and closing a few badges should not
    // bury the page the player came from under a stack of history.
    setParams(next, { replace: true });
  };

  const chooseLeague = (workspaceId: string) => {
    const q = new URLSearchParams(params);
    q.set("league", workspaceId);
    // The open badge belongs to the club it was opened on.
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
        Badge Case
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Everything there is to earn at {gameId ? getGame(gameId).name : "your"}{" "}
        events. Three go on your card at a time.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {gamesLoading || badgesLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ mt: 1 }}>
          <CollapsibleSection
            id="badges-open"
            title="Open Badges"
            hint="Earned by playing, wherever the event was."
            summary={collectedSummary(systemRows)}
            defaultOpen
          >
            <Wall rows={systemRows} onOpen={show} />
          </CollapsibleSection>

          {/* Only once the catalogue has any. A heading promising a shelf
              that holds nothing is worse than no heading. */}
          {closedShelf && (
            <CollapsibleSection
              id="badges-closed"
              title="Promo Badges"
              hint="Given out once, to a group that is now closed."
              summary={collectedSummary(closedRows)}
              defaultOpen
            >
              <Wall rows={closedRows} onOpen={show} />
            </CollapsibleSection>
          )}

          {leagues.length > 0 && (
            <CollapsibleSection
              id="badges-leagues"
              title="League Badges"
              hint="Earned at one club, and shown with its name."
              summary={collectedSummary(leagueRows)}
              defaultOpen
            >
              {/* A tab per club, inside the section rather than above it: the
                  clubs are alternatives to each other, which the shelves are
                  not. One club needs no tabs — the section is already it. */}
              {leagues.length > 1 && (
                <Tabs
                  value={league ?? false}
                  onChange={(_, next: string) => chooseLeague(next)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ mb: 1, borderBottom: 1, borderColor: "divider" }}
                >
                  {leagues.map((l) => (
                    <Tab
                      key={l.workspaceId}
                      value={l.workspaceId}
                      label={l.name}
                    />
                  ))}
                </Tabs>
              )}
              <Wall rows={leagueRows} onOpen={show} />
            </CollapsibleSection>
          )}
        </Box>
      )}

      <Detail row={open} onClose={() => show(null)} />
    </Box>
  );
}
