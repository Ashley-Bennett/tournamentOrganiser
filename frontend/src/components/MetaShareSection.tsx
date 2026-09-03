import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  FormControlLabel,
  InputAdornment,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { supabase } from "../supabaseClient";
import { getSpriteUrl } from "../utils/pokemonCache";
import { deckKey } from "../utils/deck";
import StatsTable, { type StatsColumn } from "./StatsTable";
import EventPicker, { type EventOption } from "./EventPicker";
import { useStatsDrill } from "../hooks/useStatsDrill";

/**
 * What the room actually brought.
 *
 * Share is by entries, not by pilots: a deck three people each played once has
 * the same presence in the room as one person playing it three times, and it is
 * the room an organiser is describing. `pilots` is shown alongside so a deck
 * that is really one person's pet project is still visible as such.
 *
 * A busy format has a very long tail of one-off brews, so one-offs are folded
 * away by default — they are noise in a share table, and the switch brings them
 * back for anyone actually hunting for them. Rows open a drill-down.
 *
 * Only rendered for games that have decks — the caller checks the registry.
 */

interface MetaRow {
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
  entries: number;
  pilots: number;
  match_wins: number;
  total_matches: number;
  top3_count: number;
  event_wins: number;
  first_seen: string;
  last_seen: string;
}

type Mode = "recent" | "pick";

const RECENT_COUNT = 6;

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

function DeckLabel({
  p1,
  p2,
  nameMap,
}: {
  p1: number | null;
  p2: number | null;
  nameMap: Map<number, string>;
}) {
  if (!p1 && !p2) {
    return (
      <Typography variant="body2" color="text.secondary">
        Unknown
      </Typography>
    );
  }
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      {p1 != null && (
        <img src={getSpriteUrl(p1)} alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
      )}
      {p2 != null && (
        <img src={getSpriteUrl(p2)} alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
      )}
      <Typography variant="body2">
        {[p1, p2]
          .filter(Boolean)
          .map((id) => nameMap.get(id!) ?? `#${id}`)
          .join(" / ")}
      </Typography>
    </Box>
  );
}

export default function MetaShareSection({
  workspaceId,
  gameId,
  nameMap,
  onScopeChange,
}: {
  workspaceId: string;
  gameId: string | null;
  nameMap: Map<number, string>;
  /**
   * Reports the events this table is describing, so a deck drill-down opened
   * from it covers the same scope and the totals reconcile.
   */
  onScopeChange?: (tournamentIds: string[]) => void;
}) {
  const [mode, setMode] = useState<Mode>("recent");
  const [options, setOptions] = useState<EventOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<MetaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showOneOffs, setShowOneOffs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let query = supabase
      .from("tournaments")
      .select("id, name, status, starts_at, created_at, game_id")
      .eq("workspace_id", workspaceId)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
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

  // "Last 6 events" is resolved to explicit ids rather than a date window, so
  // the section says exactly which events it is describing.
  const recentIds = useMemo(
    () => options.slice(0, RECENT_COUNT).map((o) => o.id),
    [options],
  );

  // Joined into a string so the effect below compares by value: a fresh array
  // with the same ids must not trigger another fetch.
  const activeIds = mode === "recent" ? recentIds : selected;
  const drill = useStatsDrill();

  useEffect(() => {
    onScopeChange?.(activeIds);
  }, [activeIds, onScopeChange]);
  const activeKey = activeIds.join(",");

  useEffect(() => {
    const ids = activeKey === "" ? [] : activeKey.split(",");
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase
      .rpc("get_organiser_meta_share", {
        p_workspace_id: workspaceId,
        p_tournament_ids: ids,
        p_from: undefined,
        p_to: undefined,
        p_game_id: gameId ?? undefined,
      })
      .then(({ data }) => {
        setRows((data ?? []) as MetaRow[]);
        setLoading(false);
      });
  }, [workspaceId, gameId, activeKey]);

  // Share is always of the whole field, not of what survives the filters —
  // otherwise hiding one-offs would silently inflate everything else.
  const totalEntries = useMemo(
    () => rows.reduce((sum, r) => sum + r.entries, 0),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showOneOffs && r.entries < 2) return false;
      if (q === "") return true;
      const label = [r.deck_pokemon1, r.deck_pokemon2]
        .filter((id): id is number => id != null)
        .map((id) => nameMap.get(id) ?? `#${id}`)
        .join(" / ")
        .toLowerCase();
      return label.includes(q);
    });
  }, [rows, search, showOneOffs, nameMap]);

  const oneOffCount = useMemo(() => rows.filter((r) => r.entries < 2).length, [rows]);

  const columns: StatsColumn<MetaRow>[] = useMemo(
    () => [
      {
        key: "deck",
        label: "Deck",
        sortValue: (r) =>
          [r.deck_pokemon1, r.deck_pokemon2]
            .filter((id): id is number => id != null)
            .map((id) => nameMap.get(id) ?? `#${id}`)
            .join(" / ")
            .toLowerCase(),
        render: (r) => (
          <DeckLabel p1={r.deck_pokemon1} p2={r.deck_pokemon2} nameMap={nameMap} />
        ),
      },
      {
        key: "share",
        label: "Share",
        sortValue: (r) => r.entries,
        csvValue: (r) =>
          totalEntries > 0 ? Number(((r.entries / totalEntries) * 100).toFixed(1)) : 0,
        render: (r) => {
          const share = totalEntries > 0 ? (r.entries / totalEntries) * 100 : 0;
          return (
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  flex: "0 0 72px",
                  height: 6,
                  borderRadius: 3,
                  bgcolor: "action.hover",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    width: `${share}%`,
                    height: "100%",
                    bgcolor: "primary.main",
                    borderRadius: 3,
                  }}
                />
              </Box>
              <Typography variant="body2" fontWeight={600}>
                {share.toFixed(0)}%
              </Typography>
            </Box>
          );
        },
      },
      {
        key: "entries",
        label: "Entries",
        sortValue: (r) => r.entries,
        render: (r) => <Typography variant="body2">{r.entries}</Typography>,
      },
      {
        key: "pilots",
        label: "Pilots",
        sortValue: (r) => r.pilots,
        render: (r) => (
          <Typography variant="body2" color="text.secondary">
            {r.pilots}
          </Typography>
        ),
      },
      {
        key: "winrate",
        label: "Win rate",
        sortValue: (r) => (r.total_matches > 0 ? r.match_wins / r.total_matches : null),
        csvValue: (r) =>
          r.total_matches > 0
            ? Number(((r.match_wins / r.total_matches) * 100).toFixed(1))
            : null,
        render: (r) => (
          <Typography variant="body2">{pct(r.match_wins, r.total_matches)}</Typography>
        ),
      },
      {
        key: "top3",
        label: "Top 3",
        sortValue: (r) => r.top3_count,
        render: (r) => <Typography variant="body2">{r.top3_count}</Typography>,
      },
      {
        key: "wins",
        label: "Event wins",
        sortValue: (r) => r.event_wins,
        render: (r) => <Typography variant="body2">{r.event_wins}</Typography>,
      },
    ],
    [nameMap, totalEntries],
  );

  return (
    <>
      <Box display="flex" flexWrap="wrap" gap={1.5} alignItems="center" mb={2}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, next) => next && setMode(next as Mode)}
          aria-label="Meta share events"
        >
          <ToggleButton value="recent">Last {RECENT_COUNT} events</ToggleButton>
          <ToggleButton value="pick">Pick events</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder="Search decks"
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

        {oneOffCount > 0 && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showOneOffs}
                onChange={(e) => setShowOneOffs(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Show {oneOffCount} one-off{oneOffCount === 1 ? "" : "s"}
              </Typography>
            }
          />
        )}
      </Box>

      {mode === "pick" && (
        <EventPicker options={options} selected={selected} onChange={setSelected} />
      )}

      {!loading && rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          Showing {visibleRows.length} of {rows.length} decks across {totalEntries} entries in{" "}
          {activeIds.length} event{activeIds.length === 1 ? "" : "s"}. Click a deck for its pilots.
        </Typography>
      )}

      {mode === "pick" && selected.length === 0 ? (
        <Alert severity="info">Pick one or more events above to see what people brought.</Alert>
      ) : (
        <StatsTable
          rows={visibleRows}
          columns={columns}
          getRowKey={deckKey}
          initialSort={{ key: "entries", dir: "desc" }}
          loading={loading}
          emptyMessage={
            rows.length === 0
              ? "No decks were registered in these events."
              : "No decks match those filters."
          }
          maxRows={10}
          csvFilename={`matchamp-meta-share-${new Date().toISOString().slice(0, 10)}`}
          onRowClick={(r) =>
            drill.open({
              kind: "deck",
              p1: r.deck_pokemon1,
              p2: r.deck_pokemon2,
              scoped: true,
            })
          }
        />
      )}

    </>
  );
}
