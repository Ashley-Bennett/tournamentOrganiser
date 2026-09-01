import React, { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { supabase } from "../supabaseClient";
import { getArtworkUrl, getSpriteUrl } from "../utils/pokemonCache";
import StatsTable, { type StatsColumn } from "./StatsTable";

/**
 * Drill-down for one row of the meta share table: who piloted this deck and
 * where it turned up. Scoped to exactly the events the table above was
 * describing, so the totals here reconcile with the row that was clicked.
 */

export interface DeckKey {
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
}

interface PilotRow {
  identity_key: string;
  display_name: string;
  is_linked: boolean;
  entries: number;
  match_wins: number;
  total_matches: number;
  best_finish: number | null;
  event_wins: number;
  first_used: string;
  last_used: string;
}

interface EventRow {
  tournament_id: string;
  tournament_name: string;
  played_at: string;
  event_status: string;
  copies: number;
  field_size: number;
  best_finish: number | null;
  match_wins: number;
  total_matches: number;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.disabled">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

export default function DeckDetailModal({
  workspaceId,
  gameId,
  deck,
  tournamentIds,
  nameMap,
  onClose,
}: {
  workspaceId: string;
  gameId: string | null;
  deck: DeckKey | null;
  /** The same event scope the meta share table used. */
  tournamentIds: string[];
  nameMap: Map<number, string>;
  onClose: () => void;
}) {
  const [pilots, setPilots] = useState<PilotRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const p1 = deck?.deck_pokemon1 ?? null;
  const p2 = deck?.deck_pokemon2 ?? null;
  const open = deck != null;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const args = {
      p_workspace_id: workspaceId,
      p_deck_pokemon1: p1,
      p_deck_pokemon2: p2,
      p_tournament_ids: tournamentIds,
      p_from: null,
      p_to: null,
      p_game_id: gameId,
    };
    void Promise.all([
      supabase.rpc("get_organiser_deck_pilots", args),
      supabase.rpc("get_organiser_deck_events", args),
    ]).then(([pilotRes, eventRes]) => {
      setPilots((pilotRes.data ?? []) as PilotRow[]);
      setEvents((eventRes.data ?? []) as EventRow[]);
      setLoading(false);
    });
  }, [open, workspaceId, gameId, p1, p2, tournamentIds]);

  const deckName =
    [p1, p2]
      .filter((id): id is number => id != null)
      .map((id) => nameMap.get(id) ?? `#${id}`)
      .join(" / ") || "Unknown deck";

  const totalEntries = pilots.reduce((s, p) => s + p.entries, 0);
  const totalWins = pilots.reduce((s, p) => s + p.match_wins, 0);
  const totalMatches = pilots.reduce((s, p) => s + p.total_matches, 0);
  const totalEventWins = pilots.reduce((s, p) => s + p.event_wins, 0);
  const bestFinish = pilots.reduce<number | null>((best, p) => {
    if (p.best_finish == null) return best;
    return best == null || p.best_finish < best ? p.best_finish : best;
  }, null);

  const pilotColumns: StatsColumn<PilotRow>[] = [
    {
      key: "name",
      label: "Pilot",
      sortValue: (r) => r.display_name.toLowerCase(),
      render: (r) => (
        <Box display="flex" alignItems="center" gap={0.75}>
          <Typography variant="body2">{r.display_name}</Typography>
          {r.is_linked && <Chip label="Account" size="small" variant="outlined" />}
          {r.event_wins > 0 && <EmojiEventsIcon fontSize="small" color="warning" />}
        </Box>
      ),
    },
    {
      key: "entries",
      label: "Entries",
      sortValue: (r) => r.entries,
      render: (r) => <Typography variant="body2">{r.entries}</Typography>,
    },
    {
      key: "winrate",
      label: "Win rate",
      sortValue: (r) => (r.total_matches > 0 ? r.match_wins / r.total_matches : null),
      render: (r) => (
        <Typography variant="body2" fontWeight={600}>
          {pct(r.match_wins, r.total_matches)}
        </Typography>
      ),
    },
    {
      key: "matches",
      label: "Matches",
      sortValue: (r) => r.total_matches,
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {r.match_wins}W of {r.total_matches}
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
    {
      key: "last",
      label: "Last used",
      sortValue: (r) => new Date(r.last_used).getTime(),
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {new Date(r.last_used).toLocaleDateString()}
        </Typography>
      ),
    },
  ];

  const eventColumns: StatsColumn<EventRow>[] = [
    {
      key: "event",
      label: "Event",
      sortValue: (r) => r.tournament_name.toLowerCase(),
      render: (r) => (
        <Box display="flex" alignItems="center" gap={0.75}>
          <Typography variant="body2">{r.tournament_name}</Typography>
          {r.event_status !== "completed" && (
            <Chip label="In progress" size="small" color="warning" variant="outlined" />
          )}
        </Box>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortValue: (r) => new Date(r.played_at).getTime(),
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {new Date(r.played_at).toLocaleDateString()}
        </Typography>
      ),
    },
    {
      key: "copies",
      label: "Copies",
      sortValue: (r) => r.copies,
      render: (r) => (
        <Typography variant="body2">
          {r.copies}
          {r.field_size > 0 && (
            <Typography component="span" variant="caption" color="text.disabled">
              {" "}
              of {r.field_size}
            </Typography>
          )}
        </Typography>
      ),
    },
    {
      key: "winrate",
      label: "Win rate",
      sortValue: (r) => (r.total_matches > 0 ? r.match_wins / r.total_matches : null),
      render: (r) => <Typography variant="body2">{pct(r.match_wins, r.total_matches)}</Typography>,
    },
    {
      key: "best",
      label: "Best finish",
      sortValue: (r) => r.best_finish,
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {r.best_finish != null ? `${r.best_finish}${ordinal(r.best_finish)}` : "—"}
        </Typography>
      ),
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Box display="flex" alignItems="center" gap={1}>
          {p1 != null && (
            <img
              src={getArtworkUrl(p1)}
              alt=""
              style={{ width: 40, height: 40, objectFit: "contain" }}
            />
          )}
          {p2 != null && (
            <img
              src={getSpriteUrl(p2)}
              alt=""
              style={{ width: 32, height: 32, imageRendering: "pixelated" }}
            />
          )}
          <Typography variant="h6" fontWeight={700}>
            {deckName}
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2} mb={1}>
          <Grid item xs={6} sm={3}>
            <StatBox label="Entries" value={String(totalEntries)} sub={`${pilots.length} pilots`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatBox
              label="Win rate"
              value={pct(totalWins, totalMatches)}
              sub={`${totalWins}W of ${totalMatches}`}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatBox
              label="Best finish"
              value={bestFinish != null ? `${bestFinish}${ordinal(bestFinish)}` : "—"}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatBox label="Event wins" value={String(totalEventWins)} />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        <Typography variant="overline" color="text.secondary" display="block" mb={1}>
          Pilots
        </Typography>
        <StatsTable
          rows={pilots}
          columns={pilotColumns}
          getRowKey={(r) => r.identity_key}
          initialSort={{ key: "entries", dir: "desc" }}
          loading={loading}
          emptyMessage="Nobody has registered this deck in these events."
          maxRows={8}
        />

        <Divider sx={{ my: 2 }} />
        <Typography variant="overline" color="text.secondary" display="block" mb={1}>
          Events
        </Typography>
        <StatsTable
          rows={events}
          columns={eventColumns}
          getRowKey={(r) => r.tournament_id}
          initialSort={{ key: "date", dir: "desc" }}
          loading={loading}
          emptyMessage="This deck has not appeared in these events."
          maxRows={8}
        />
      </DialogContent>
    </Dialog>
  );
}
