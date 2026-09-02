import { useState } from "react";
import {
  Box,
  ButtonBase,
  Chip,
  Collapse,
  Skeleton,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import HistoryIcon from "@mui/icons-material/History";
import { supabase } from "../supabaseClient";
import { relativeTime } from "../utils/relativeTime";

/**
 * Who changed this record, and when.
 *
 * Reads the audit log through get_record_history, which is gated on
 * membership of the workspace that owns the record — so this renders nothing
 * useful for anyone who should not see it, and the RPC refuses outright.
 *
 * Loads on expand rather than on mount: most of the time nobody asks, and the
 * payloads are the full before/after rows.
 *
 * `changeCount` comes from get_record_change_counts, batched by the parent.
 * When a record has never been changed, this renders nothing at all — a
 * History control that opens to say "created" is noise on every row of a
 * list, and creation is already implied by the record being there.
 */

export type AuditedTable =
  | "tournaments"
  | "tournament_players"
  | "tournament_matches"
  | "match_result_reports"
  | "workspace_memberships"
  | "tournament_player_claims"
  | "workspace_player_links";

interface HistoryRow {
  changed_at: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  actor: string;
  actor_kind: "account" | "player" | "unattributed";
  changed_fields: string[] | null;
}

/** Columns that carry no meaning for a reader, so are not worth listing. */
const NOISE_FIELDS = new Set(["updated_at", "created_at"]);

function operationLabel(op: HistoryRow["operation"]): string {
  if (op === "INSERT") return "created";
  if (op === "DELETE") return "deleted";
  return "changed";
}

/** `temp_winner_id` reads better as `temp winner`. */
function fieldLabel(field: string): string {
  return field.replace(/_id$/, "").replace(/_/g, " ");
}

export default function RecordHistory({
  table,
  recordId,
  changeCount,
}: {
  table: AuditedTable;
  recordId: string;
  /**
   * Number of changes since creation. Omit to always show the control;
   * pass 0 to hide it entirely.
   */
  changeCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing has happened to this record beyond its creation.
  if (changeCount === 0) return null;

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    // Refetch on every expand rather than caching: the dialog this sits in is
    // where the record gets changed, so a cached list goes stale the moment
    // someone drops a player and reopens the panel.
    if (!next || loading) return;

    setLoading(true);
    setError(null);
    void supabase
      .rpc("get_record_history", {
        p_table_name: table,
        p_record_id: recordId,
      })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          setError("Could not load the history for this record.");
        } else {
          setRows((data ?? []) as HistoryRow[]);
        }
        setLoading(false);
      });
  }

  return (
    <Box sx={{ mt: 2, borderTop: 1, borderColor: "divider", pt: 1 }}>
      <ButtonBase
        onClick={toggle}
        sx={{
          width: "100%",
          justifyContent: "flex-start",
          gap: 1,
          py: 0.5,
          borderRadius: 1,
        }}
      >
        <HistoryIcon fontSize="small" color="action" />
        <Typography variant="body2" color="text.secondary">
          {changeCount === undefined ? "History" : `History (${changeCount})`}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {expanded ? (
          <ExpandLessIcon fontSize="small" color="action" />
        ) : (
          <ExpandMoreIcon fontSize="small" color="action" />
        )}
      </ButtonBase>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ pt: 1, pb: 0.5 }}>
          {loading && <Skeleton variant="rounded" height={56} />}

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}

          {!loading && rows && rows.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nothing recorded yet.
            </Typography>
          )}

          {!loading &&
            rows?.map((row, i) => {
              const fields = (row.changed_fields ?? []).filter(
                (f) => !NOISE_FIELDS.has(f),
              );
              return (
                <Box
                  key={`${row.changed_at}-${i}`}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 0.75,
                    py: 0.75,
                    borderBottom: i < rows.length - 1 ? 1 : 0,
                    borderColor: "divider",
                  }}
                >
                  {row.actor_kind !== "unattributed" && (
                    <Typography variant="body2" fontWeight={600}>
                      {row.actor}
                    </Typography>
                  )}
                  {row.actor_kind === "player" && (
                    <Chip label="player" size="small" variant="outlined" />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {/* Anything before the actor label shipped cannot be
                        attributed, so say so rather than naming "Unknown". */}
                    {row.actor_kind === "unattributed" && "Someone "}
                    {operationLabel(row.operation)}
                    {fields.length > 0 &&
                      ` ${fields.map(fieldLabel).join(", ")}`}
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {relativeTime(row.changed_at)}
                  </Typography>
                </Box>
              );
            })}
        </Box>
      </Collapse>
    </Box>
  );
}
