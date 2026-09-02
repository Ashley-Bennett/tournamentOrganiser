import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SearchIcon from "@mui/icons-material/Search";
import { supabase } from "../supabaseClient";
import StatsTable, { type StatsColumn } from "./StatsTable";
import EventPicker, { type EventOption } from "./EventPicker";
import { useStatsDrill } from "../hooks/useStatsDrill";
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
 * already showed, and placement points for where players finished. The default
 * sort is by the total, but every column sorts, so a club can see whether their
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

type Mode = "window" | "pick";

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export default function LeagueTableSection({
  workspaceId,
  gameId,
}: {
  workspaceId: string;
  gameId: string | null;
}) {
  const drill = useStatsDrill();
  const [mode, setMode] = useState<Mode>("window");
  const [schemeId, setSchemeId] = useState(DEFAULT_SCHEME_ID);
  const [options, setOptions] = useState<EventOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const scheme = schemeById(schemeId);
  const schemeKey = scheme.points.join(",");

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

  const selectedKey = selected.join(",");

  useEffect(() => {
    // Picking mode with nothing chosen has no table to draw — skip the round
    // trip rather than rendering an empty league.
    if (mode === "pick" && selectedKey === "") {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const win = rollingWindow(LEAGUE_WINDOW_WEEKS);
    void supabase
      .rpc("get_organiser_league_table", {
        p_workspace_id: workspaceId,
        p_tournament_ids: mode === "pick" ? selectedKey.split(",") : null,
        p_from: mode === "window" ? win.from.toISOString() : null,
        p_to: mode === "window" ? win.to.toISOString() : null,
        p_game_id: mode === "window" ? gameId : null,
        p_placement_points: schemeKey === "" ? [] : schemeKey.split(",").map(Number),
      })
      .then(({ data }) => {
        setRows((data ?? []) as LeagueRow[]);
        setLoading(false);
      });
  }, [workspaceId, gameId, mode, selectedKey, schemeKey]);

  const showPlacement = scheme.points.length > 0;

  const eventsInWindow = useMemo(() => {
    const win = rollingWindow(LEAGUE_WINDOW_WEEKS);
    return options.filter((o) => new Date(o.played_at) >= win.from).length;
  }, [options]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return rows;
    return rows.filter((r) => r.display_name.toLowerCase().includes(q));
  }, [rows, search]);

  // League position, fixed to the standing the RPC returned (which is already
  // ordered by total points). Deriving it from the row's display index instead
  // would relabel everyone the moment someone sorts by, say, win count — the
  // rank has to mean "position in the league", not "position in this view".
  const rankByKey = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.identity_key, i + 1));
    return m;
  }, [rows]);

  const columns: StatsColumn<LeagueRow>[] = useMemo(() => {
    const cols: StatsColumn<LeagueRow>[] = [
      {
        key: "rank",
        label: "#",
        sortValue: (r) => rankByKey.get(r.identity_key) ?? null,
        render: (r) => {
          const rank = rankByKey.get(r.identity_key) ?? 0;
          return (
            <Typography
              variant="body2"
              fontWeight={rank <= 3 ? 700 : 400}
              color={rank === 1 ? "warning.main" : "text.secondary"}
            >
              {rank}
            </Typography>
          );
        },
      },
      {
        key: "player",
        label: "Player",
        sortValue: (r) => r.display_name.toLowerCase(),
        render: (r) => (
          <Box display="flex" alignItems="center" gap={0.75}>
            <Typography variant="body2">{r.display_name}</Typography>
            {r.event_wins > 0 && (
              <Tooltip title={`${r.event_wins} event win${r.event_wins === 1 ? "" : "s"}`}>
                <EmojiEventsIcon fontSize="small" color="warning" />
              </Tooltip>
            )}
          </Box>
        ),
      },
      {
        key: "events",
        label: "Events",
        sortValue: (r) => r.events_played,
        render: (r) => <Typography variant="body2">{r.events_played}</Typography>,
      },
      {
        key: "record",
        label: "W–L–D",
        sortValue: (r) => r.wins,
        csvValue: (r) => `${r.wins}-${r.losses}-${r.draws}`,
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {r.wins}–{r.losses}–{r.draws}
          </Typography>
        ),
      },
      {
        key: "matchpts",
        label: "Match pts",
        sortValue: (r) => r.match_points,
        render: (r) => <Typography variant="body2">{r.match_points}</Typography>,
      },
    ];

    if (showPlacement) {
      cols.push({
        key: "placepts",
        label: "Place pts",
        sortValue: (r) => r.placement_points,
        render: (r) => <Typography variant="body2">{r.placement_points}</Typography>,
      });
    }

    cols.push(
      {
        key: "byes",
        label: "Byes",
        sortValue: (r) => r.byes,
        render: (r) => (
          <Typography variant="body2" color={r.byes > 0 ? "text.primary" : "text.disabled"}>
            {r.byes}
          </Typography>
        ),
      },
      {
        key: "total",
        label: "Total",
        sortValue: (r) => r.total_points,
        render: (r) => (
          <Typography variant="body2" fontWeight={700}>
            {r.total_points}
          </Typography>
        ),
      },
      {
        key: "best",
        label: "Best",
        sortValue: (r) => r.best_finish,
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {r.best_finish != null ? `${r.best_finish}${ordinal(r.best_finish)}` : "—"}
          </Typography>
        ),
      },
    );

    return cols;
  }, [showPlacement, rankByKey]);

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
              {s.name} · {s.hint}
            </MenuItem>
          ))}
        </Select>

        <TextField
          size="small"
          placeholder="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 200 }}
        />

        {mode === "window" && (
          <Typography variant="body2" color="text.secondary">
            {eventsInWindow} event{eventsInWindow === 1 ? "" : "s"} in the window
          </Typography>
        )}
      </Box>

      {mode === "pick" && (
        <EventPicker options={options} selected={selected} onChange={setSelected} />
      )}

      {mode === "pick" && selected.length === 0 ? (
        <Alert severity="info">Pick one or more events above to build a league table.</Alert>
      ) : (
        <StatsTable
          rows={visibleRows}
          columns={columns}
          getRowKey={(r) => r.identity_key}
          onRowClick={(r) =>
            drill.open({ kind: "player", identityKey: r.identity_key })
          }
          initialSort={{ key: "total", dir: "desc" }}
          loading={loading}
          csvFilename={`matchamp-league-${new Date().toISOString().slice(0, 10)}`}
          emptyMessage={
            rows.length === 0
              ? "No results in these events yet."
              : "No players match that search."
          }
          maxRows={10}
        />
      )}
    </>
  );
}
