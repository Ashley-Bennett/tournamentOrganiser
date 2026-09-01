import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Collapse, Typography } from "@mui/material";
import MergeIcon from "@mui/icons-material/Merge";
import { supabase } from "../supabaseClient";

/**
 * Likely duplicate players, by name similarity.
 *
 * Suggestions only — nothing merges on its own. Two people genuinely called
 * "Dan OKafor" and "Dan Okafor" look identical to a computer and different to
 * an organiser who was in the room, and only one of them is right.
 *
 * The merge always keeps the identity with more events as the target, so the
 * busier history absorbs the stray rather than the other way round.
 */

interface Suggestion {
  key_a: string;
  name_a: string;
  events_a: number;
  linked_a: boolean;
  key_b: string;
  name_b: string;
  events_b: number;
  linked_b: boolean;
  similarity: number;
}

export default function MergeSuggestions({
  workspaceId,
  canEdit,
  refreshKey,
  onChanged,
}: {
  workspaceId: string;
  canEdit: boolean;
  /**
   * Bumped by the page whenever an identity changes anywhere — including from
   * the player dialog, which can merge, split and undo without this component
   * knowing. Without it the list goes stale the moment a correction is made
   * somewhere else.
   */
  refreshKey: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(() => {
    void supabase
      .rpc("get_workspace_merge_suggestions", {
        p_workspace_id: workspaceId,
        p_threshold: 0.45,
      })
      .then(({ data }) => setRows((data ?? []) as Suggestion[]));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const visible = rows.filter((r) => !dismissed.includes(r.key_a + r.key_b));

  if (visible.length === 0) return null;

  async function merge(s: Suggestion) {
    // Bigger history wins, so the merged person keeps the fuller record.
    const [target, source] =
      s.events_a >= s.events_b ? [s.key_a, s.key_b] : [s.key_b, s.key_a];
    setBusy(s.key_a + s.key_b);
    setError(null);
    const { error: err } = await supabase.rpc("merge_workspace_players", {
      p_workspace_id: workspaceId,
      p_source_keys: [source],
      p_target_key: target,
    });
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
    load();
  }

  return (
    <Box mb={2}>
      <Button size="small" startIcon={<MergeIcon />} onClick={() => setOpen((o) => !o)}>
        {visible.length} possible duplicate{visible.length === 1 ? "" : "s"}
      </Button>

      <Collapse in={open}>
        <Box mt={1}>
          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.disabled" mb={1}>
            Names similar enough to be the same person. Merging keeps whichever has played more
            events, and can be undone from that player afterwards.
          </Typography>

          {visible.map((s) => {
            const id = s.key_a + s.key_b;
            const keepA = s.events_a >= s.events_b;
            return (
              <Box
                key={id}
                display="flex"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
                py={0.75}
                sx={{ borderBottom: 1, borderColor: "divider" }}
              >
                <Chip
                  size="small"
                  label={`${s.name_a} · ${s.events_a}`}
                  variant={keepA ? "filled" : "outlined"}
                />
                <Typography variant="caption" color="text.disabled">
                  {keepA ? "←" : "→"}
                </Typography>
                <Chip
                  size="small"
                  label={`${s.name_b} · ${s.events_b}`}
                  variant={keepA ? "outlined" : "filled"}
                />
                <Typography variant="caption" color="text.disabled" flexGrow={1}>
                  {(s.similarity * 100).toFixed(0)}% alike
                </Typography>
                {canEdit && (
                  <>
                    <Button size="small" disabled={busy === id} onClick={() => void merge(s)}>
                      Merge
                    </Button>
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => setDismissed((d) => [...d, id])}
                    >
                      Not the same
                    </Button>
                  </>
                )}
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
