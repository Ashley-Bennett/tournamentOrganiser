import React, { useEffect, useState } from "react";
import { Box, Chip, Grid, Skeleton, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { supabase } from "../supabaseClient";
import { getSpriteUrl } from "../utils/pokemonCache";
import StatsTable, { type StatsColumn } from "./StatsTable";
import StatBox from "./StatBox";
import { deckLabel, pct, placing, record } from "../utils/statsFormat";
import type { DetailView } from "../utils/statsDrill";

/**
 * Drill-down for one person: what they bring, where they play, and who they
 * keep running into.
 *
 * Deliberately all-time within the current game filter rather than inheriting
 * the event window of whatever table opened it. Clicking a person asks "who is
 * this player", which six weeks of league table cannot answer — and it keeps a
 * shared link meaning the same thing wherever it was made.
 */

interface SummaryRow {
  display_name: string;
  is_linked: boolean;
  events_played: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  matches_played: number;
  best_finish: number | null;
  event_wins: number;
  first_seen: string;
  last_seen: string;
}

interface DeckRow {
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
  entries: number;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
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
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  matches_played: number;
  finish_position: number | null;
  field_size: number;
}

interface OpponentRow {
  opponent_key: string;
  opponent_name: string;
  is_linked: boolean;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  last_played: string;
}

function DeckCell({
  p1,
  p2,
  nameMap,
}: {
  p1: number | null;
  p2: number | null;
  nameMap: Map<number, string>;
}) {
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      {p1 != null && (
        <img
          src={getSpriteUrl(p1)}
          alt=""
          style={{ width: 28, height: 28, imageRendering: "pixelated" }}
        />
      )}
      {p2 != null && (
        <img
          src={getSpriteUrl(p2)}
          alt=""
          style={{ width: 28, height: 28, imageRendering: "pixelated" }}
        />
      )}
      <Typography variant="body2">{deckLabel(p1, p2, nameMap)}</Typography>
    </Box>
  );
}

export default function PlayerDetailView({
  workspaceId,
  gameId,
  identityKey,
  nameMap,
  onOpen,
  onLabel,
}: {
  workspaceId: string;
  gameId: string | null;
  identityKey: string;
  nameMap: Map<number, string>;
  /** Drill onwards — to one of their decks, or to an opponent. */
  onOpen: (view: DetailView) => void;
  /** Reports the resolved name upward, for the dialog's breadcrumb. */
  onLabel: (label: string) => void;
}) {
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);

    const args = {
      p_workspace_id: workspaceId,
      p_identity_key: identityKey,
      p_tournament_ids: null,
      p_from: null,
      p_to: null,
      p_game_id: gameId,
    };

    void Promise.all([
      supabase.rpc("get_organiser_player_summary", args),
      supabase.rpc("get_organiser_player_decks", args),
      supabase.rpc("get_organiser_player_events", args),
      supabase.rpc("get_organiser_player_opponents", args),
    ]).then(([s, d, e, o]) => {
      if (stale) return;
      const row = ((s.data ?? []) as SummaryRow[])[0] ?? null;
      setSummary(row);
      setDecks((d.data ?? []) as DeckRow[]);
      setEvents((e.data ?? []) as EventRow[]);
      setOpponents((o.data ?? []) as OpponentRow[]);
      setLoading(false);
      if (row) onLabel(row.display_name);
    });

    return () => {
      stale = true;
    };
    // onLabel is called once per load; excluding it keeps this from refetching
    // every time the parent re-renders with a new closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, gameId, identityKey]);

  const deckColumns: StatsColumn<DeckRow>[] = [
    {
      key: "deck",
      label: "Deck",
      sortValue: (r) => deckLabel(r.deck_pokemon1, r.deck_pokemon2, nameMap),
      render: (r) => (
        <DeckCell p1={r.deck_pokemon1} p2={r.deck_pokemon2} nameMap={nameMap} />
      ),
    },
    {
      key: "entries",
      label: "Events",
      sortValue: (r) => r.entries,
      render: (r) => <Typography variant="body2">{r.entries}</Typography>,
    },
    {
      key: "winrate",
      label: "Win rate",
      sortValue: (r) => (r.matches_played > 0 ? r.wins / r.matches_played : null),
      render: (r) => (
        <Typography variant="body2" fontWeight={600}>
          {pct(r.wins, r.matches_played)}
        </Typography>
      ),
    },
    {
      key: "record",
      label: "Record",
      sortValue: (r) => r.matches_played,
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {record(r.wins, r.losses, r.draws)}
        </Typography>
      ),
    },
    {
      key: "best",
      label: "Best",
      sortValue: (r) => r.best_finish,
      render: (r) => (
        <Box display="flex" alignItems="center" gap={0.5}>
          <Typography variant="body2" color="text.secondary">
            {placing(r.best_finish)}
          </Typography>
          {r.event_wins > 0 && <EmojiEventsIcon fontSize="small" color="warning" />}
        </Box>
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
      key: "deck",
      label: "Deck",
      sortValue: (r) => deckLabel(r.deck_pokemon1, r.deck_pokemon2, nameMap),
      render: (r) => (
        <DeckCell p1={r.deck_pokemon1} p2={r.deck_pokemon2} nameMap={nameMap} />
      ),
    },
    {
      key: "record",
      label: "Record",
      sortValue: (r) => (r.matches_played > 0 ? r.wins / r.matches_played : null),
      render: (r) => (
        <Typography variant="body2">{record(r.wins, r.losses, r.draws)}</Typography>
      ),
    },
    {
      key: "finish",
      label: "Finish",
      sortValue: (r) => r.finish_position,
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {placing(r.finish_position)}
          {r.finish_position != null && r.field_size > 0 && (
            <Typography component="span" variant="caption" color="text.disabled">
              {" "}
              of {r.field_size}
            </Typography>
          )}
        </Typography>
      ),
    },
  ];

  const opponentColumns: StatsColumn<OpponentRow>[] = [
    {
      key: "name",
      label: "Opponent",
      sortValue: (r) => r.opponent_name.toLowerCase(),
      render: (r) => (
        <Box display="flex" alignItems="center" gap={0.75}>
          <Typography variant="body2">{r.opponent_name}</Typography>
          {r.is_linked && <Chip label="Account" size="small" variant="outlined" />}
        </Box>
      ),
    },
    {
      key: "record",
      label: "Record",
      sortValue: (r) => r.wins - r.losses,
      render: (r) => (
        <Typography variant="body2" fontWeight={600}>
          {record(r.wins, r.losses, r.draws)}
        </Typography>
      ),
    },
    {
      key: "winrate",
      label: "Win rate",
      sortValue: (r) => (r.matches_played > 0 ? r.wins / r.matches_played : null),
      render: (r) => (
        <Typography variant="body2">{pct(r.wins, r.matches_played)}</Typography>
      ),
    },
    {
      key: "matches",
      label: "Matches",
      sortValue: (r) => r.matches_played,
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {r.matches_played}
        </Typography>
      ),
    },
    {
      key: "last",
      label: "Last played",
      sortValue: (r) => new Date(r.last_played).getTime(),
      render: (r) => (
        <Typography variant="body2" color="text.secondary">
          {new Date(r.last_played).toLocaleDateString()}
        </Typography>
      ),
    },
  ];

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={72} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={180} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!summary) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
        No events for this player in the current game.
      </Typography>
    );
  }

  return (
    <Box>
      <Grid container spacing={2} mb={1}>
        <Grid item xs={6} sm={3}>
          <StatBox
            label="Events"
            value={String(summary.events_played)}
            sub={`since ${new Date(summary.first_seen).toLocaleDateString()}`}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatBox
            label="Win rate"
            value={pct(summary.wins, summary.matches_played)}
            sub={`${record(summary.wins, summary.losses, summary.draws)} in ${summary.matches_played}`}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatBox
            label="Best finish"
            value={placing(summary.best_finish)}
            sub={summary.event_wins > 0 ? `${summary.event_wins} won` : undefined}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatBox label="Decks" value={String(decks.length)} sub={`${opponents.length} opponents`} />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" fontWeight={700} mt={3} mb={1}>
        Decks
      </Typography>
      <StatsTable
        rows={decks}
        columns={deckColumns}
        getRowKey={(r) => `${r.deck_pokemon1}-${r.deck_pokemon2}`}
        onRowClick={(r) =>
          onOpen({
            kind: "deck",
            p1: r.deck_pokemon1,
            p2: r.deck_pokemon2,
            scoped: false,
          })
        }
        maxRows={10}
        csvFilename="player-decks"
        emptyMessage="No decks recorded."
      />

      <Typography variant="subtitle2" fontWeight={700} mt={3} mb={1}>
        Head to head
      </Typography>
      <StatsTable
        rows={opponents}
        columns={opponentColumns}
        getRowKey={(r) => r.opponent_key}
        onRowClick={(r) => onOpen({ kind: "player", identityKey: r.opponent_key })}
        maxRows={10}
        csvFilename="player-head-to-head"
        emptyMessage="No opponents yet."
      />

      <Typography variant="subtitle2" fontWeight={700} mt={3} mb={1}>
        Events
      </Typography>
      <StatsTable
        rows={events}
        columns={eventColumns}
        getRowKey={(r) => r.tournament_id}
        maxRows={10}
        csvFilename="player-events"
        emptyMessage="No events yet."
      />
    </Box>
  );
}
