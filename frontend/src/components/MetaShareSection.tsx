import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { supabase } from "../supabaseClient";
import { getSpriteUrl } from "../utils/pokemonCache";

/**
 * What the room actually brought.
 *
 * Share is by entries, not by pilots: a deck three people each played once has
 * the same presence in the room as one person playing it three times, and it is
 * the room an organiser is describing. `pilots` is shown alongside so a deck
 * that is really one person's pet project is still visible as such.
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

interface TournamentOption {
  id: string;
  name: string;
  played_at: string;
}

type Mode = "recent" | "pick";

const RECENT_COUNT = 6;

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
}: {
  workspaceId: string;
  gameId: string | null;
  nameMap: Map<number, string>;
}) {
  const [mode, setMode] = useState<Mode>("recent");
  const [options, setOptions] = useState<TournamentOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<MetaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let query = supabase
      .from("tournaments")
      .select("id, name, starts_at, created_at, game_id")
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

  const activeIds = mode === "recent" ? recentIds : selected;

  useEffect(() => {
    if (activeIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase
      .rpc("get_organiser_meta_share", {
        p_workspace_id: workspaceId,
        p_tournament_ids: activeIds,
        p_from: null,
        p_to: null,
        p_game_id: gameId,
      })
      .then(({ data }) => {
        setRows((data ?? []) as MetaRow[]);
        setLoading(false);
      });
  }, [workspaceId, gameId, activeIds]);

  const totalEntries = useMemo(
    () => rows.reduce((sum, r) => sum + r.entries, 0),
    [rows],
  );

  const eventsDescribed = activeIds.length;

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
        {!loading && rows.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {rows.length} deck{rows.length === 1 ? "" : "s"} across {totalEntries} entries in{" "}
            {eventsDescribed} event{eventsDescribed === 1 ? "" : "s"}
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
        <Alert severity="info">Pick one or more events above to see what people brought.</Alert>
      ) : loading ? (
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No decks were registered in these events.
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={HEAD}>Deck</th>
                <th style={HEAD}>Share</th>
                <th style={HEAD}>Entries</th>
                <th style={HEAD}>Pilots</th>
                <th style={HEAD}>Win rate</th>
                <th style={HEAD}>Top 3</th>
                <th style={HEAD}>Event wins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const share = totalEntries > 0 ? (r.entries / totalEntries) * 100 : 0;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(128,128,128,0.15)" }}>
                    <td style={CELL}>
                      <DeckLabel p1={r.deck_pokemon1} p2={r.deck_pokemon2} nameMap={nameMap} />
                    </td>
                    <td style={{ ...CELL, minWidth: 140 }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        {/* The bar is the share; the number beside it is the
                            same value, so the row reads without the bar. */}
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
                    </td>
                    <td style={CELL}>
                      <Typography variant="body2">{r.entries}</Typography>
                    </td>
                    <td style={CELL}>
                      <Typography variant="body2" color="text.secondary">
                        {r.pilots}
                      </Typography>
                    </td>
                    <td style={CELL}>
                      <Typography variant="body2">
                        {pct(r.match_wins, r.total_matches)}
                      </Typography>
                    </td>
                    <td style={CELL}>
                      <Typography variant="body2">{r.top3_count}</Typography>
                    </td>
                    <td style={CELL}>
                      <Typography variant="body2">{r.event_wins}</Typography>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      )}
    </>
  );
}
