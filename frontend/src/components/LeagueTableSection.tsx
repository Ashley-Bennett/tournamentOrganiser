import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Select,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { supabase } from "../supabaseClient";
import {
  DEFAULT_SCHEME_ID,
  LEAGUE_WINDOW_WEEKS,
  PLACEMENT_SCHEMES,
  rollingWindow,
  schemeById,
} from "../utils/statsLeague";

/**
 * A running league across several events.
 *
 * Two scores side by side: match points, summed from the standings each event
 * already showed, and placement points for where players finished. Sorting is
 * by the total, but both columns are visible so a club can see whether their
 * leader is grinding matches or actually winning events.
 */

interface LeagueRow {
  identity_key: string;
  display_name: string;
  is_linked: boolean;
  events_played: number;
  match_points: number;
  placement_points: number;
  total_points: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  matches_played: number;
  best_finish: number | null;
  event_wins: number;
}

interface TournamentOption {
  id: string;
  name: string;
  status: string;
  played_at: string;
}

type Mode = "window" | "pick";

const CELL: React.CSSProperties = { padding: "10px 12px" };
const HEAD: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 12px",
  borderBottom: "1px solid rgba(128,128,128,0.3)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 600,
};

export default function LeagueTableSection({
  workspaceId,
  gameId,
}: {
  workspaceId: string;
  gameId: string | null;
}) {
  const [mode, setMode] = useState<Mode>("window");
  const [schemeId, setSchemeId] = useState(DEFAULT_SCHEME_ID);
  const [options, setOptions] = useState<TournamentOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const scheme = schemeById(schemeId);

  // The events available to pick from — the workspace's own, newest first.
  // Draft events are excluded: they have players but no results to score.
  useEffect(() => {
    let cancelled = false;
    let query = supabase
      .from("tournaments")
      .select("id, name, status, starts_at, created_at, game_id")
      .eq("workspace_id", workspaceId)
      .neq("status", "draft")
      .order("created_at", { ascending: false });

    // Only offer events for the game being viewed. The RPC honours an explicit
    // selection as given, so without this an organiser could quietly build a
    // league that mixes their chess night into the Pokémon season.
    if (gameId != null) query = query.eq("game_id", gameId);

    void query.then(({ data }) => {
      if (cancelled) return;
      setOptions(
        (data ?? []).map((t) => ({
          id: t.id as string,
          name: t.name as string,
          status: t.status as string,
          played_at: (t.starts_at ?? t.created_at) as string,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, gameId]);

  useEffect(() => {
    // Picking mode with nothing chosen has no table to draw — skip the round
    // trip rather than rendering an empty league.
    if (mode === "pick" && selected.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const win = rollingWindow(LEAGUE_WINDOW_WEEKS);
    void supabase
      .rpc("get_organiser_league_table", {
        p_workspace_id: workspaceId,
        p_tournament_ids: mode === "pick" ? selected : null,
        p_from: mode === "window" ? win.from.toISOString() : null,
        p_to: mode === "window" ? win.to.toISOString() : null,
        p_game_id: mode === "window" ? gameId : null,
        p_placement_points: scheme.points,
      })
      .then(({ data }) => {
        setRows((data ?? []) as LeagueRow[]);
        setLoading(false);
      });
  }, [workspaceId, gameId, mode, selected, schemeId, scheme.points]);

  const showPlacement = scheme.points.length > 0;

  const eventsInWindow = useMemo(() => {
    const win = rollingWindow(LEAGUE_WINDOW_WEEKS);
    return options.filter((o) => new Date(o.played_at) >= win.from).length;
  }, [options]);

  return (
    <>
      <Box display="flex" flexWrap="wrap" gap={1.5} alignItems="center" mb={2}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, next) => next && setMode(next as Mode)}
          aria-label="League events"
        >
          <ToggleButton value="window">Last {LEAGUE_WINDOW_WEEKS} weeks</ToggleButton>
          <ToggleButton value="pick">Pick events</ToggleButton>
        </ToggleButtonGroup>

        <Select
          size="small"
          value={schemeId}
          onChange={(e) => setSchemeId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {PLACEMENT_SCHEMES.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name} — {s.hint}
            </MenuItem>
          ))}
        </Select>

        {mode === "window" && (
          <Typography variant="body2" color="text.secondary">
            {eventsInWindow} event{eventsInWindow === 1 ? "" : "s"} in the window
          </Typography>
        )}
      </Box>

      {mode === "pick" && (
        <Box display="flex" flexWrap="wrap" gap={0.75} mb={2}>
          {options.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No events to pick from yet.
            </Typography>
          ) : (
            options.slice(0, 24).map((o) => {
              const isOn = selected.includes(o.id);
              return (
                <Chip
                  key={o.id}
                  size="small"
                  label={`${o.name} · ${new Date(o.played_at).toLocaleDateString()}`}
                  color={isOn ? "primary" : "default"}
                  variant={isOn ? "filled" : "outlined"}
                  onClick={() =>
                    setSelected((cur) =>
                      isOn ? cur.filter((id) => id !== o.id) : [...cur, o.id],
                    )
                  }
                />
              );
            })
          )}
        </Box>
      )}

      {mode === "pick" && selected.length === 0 ? (
        <Alert severity="info">Pick one or more events above to build a league table.</Alert>
      ) : loading ? (
        <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1 }} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No results in these events yet.
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={HEAD}>#</th>
                <th style={HEAD}>Player</th>
                <th style={HEAD}>Events</th>
                <th style={HEAD}>W–L–D</th>
                <th style={HEAD}>Match pts</th>
                {showPlacement && <th style={HEAD}>Place pts</th>}
                <th style={HEAD}>Total</th>
                <th style={HEAD}>Best</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.identity_key}
                  style={{ borderBottom: "1px solid rgba(128,128,128,0.15)" }}
                >
                  <td style={CELL}>
                    <Typography
                      variant="body2"
                      fontWeight={i < 3 ? 700 : 400}
                      color={i === 0 ? "warning.main" : "text.secondary"}
                    >
                      {i + 1}
                    </Typography>
                  </td>
                  <td style={CELL}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Typography variant="body2" fontWeight={i < 3 ? 600 : 400}>
                        {r.display_name}
                      </Typography>
                      {r.event_wins > 0 && (
                        <Tooltip
                          title={`${r.event_wins} event win${r.event_wins === 1 ? "" : "s"}`}
                        >
                          <EmojiEventsIcon fontSize="small" color="warning" />
                        </Tooltip>
                      )}
                    </Box>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2">{r.events_played}</Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2" color="text.secondary">
                      {r.wins}–{r.losses}–{r.draws}
                    </Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2">{r.match_points}</Typography>
                  </td>
                  {showPlacement && (
                    <td style={CELL}>
                      <Typography variant="body2">{r.placement_points}</Typography>
                    </td>
                  )}
                  <td style={CELL}>
                    <Typography variant="body2" fontWeight={700}>
                      {r.total_points}
                    </Typography>
                  </td>
                  <td style={CELL}>
                    <Typography variant="body2" color="text.secondary">
                      {r.best_finish != null ? `${r.best_finish}${ordinal(r.best_finish)}` : "—"}
                    </Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
    </>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
