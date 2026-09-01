import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Collapse, Typography } from "@mui/material";
import MergeIcon from "@mui/icons-material/Merge";
import { supabase } from "../supabaseClient";
import MergeConfirmDialog, { type MergeCandidate } from "./MergeConfirmDialog";

/**
 * Likely duplicate players, by name similarity.
 *
 * Suggestions only — nothing merges on its own. Two people genuinely called
 * "Dan OKafor" and "Dan Okafor" look identical to a computer and different to
 * an organiser who was in the room, and only one of them is right.
 *
 * Merging goes through a confirmation that states the direction and allows it
 * to be swapped: which spelling survives is a judgement the app cannot make.
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
  const [pending, setPending] = useState<Suggestion | null>(null);

  // Returns its own cleanup so a reload triggered by a workspace switch cannot
  // be overtaken by the request it replaced.
  const load = useCallback(() => {
    let cancelled = false;
    void supabase
      .rpc("get_workspace_merge_suggestions", {
        p_workspace_id: workspaceId,
        p_threshold: 0.45,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setError(err ? err.message : null);
        setRows(err ? [] : ((data ?? []) as Suggestion[]));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => load(), [load, refreshKey]);

  // Nothing to suggest is the normal case and stays silent, but a failed lookup
  // must not: it would otherwise read as "no duplicates found".
  if (rows.length === 0 && !error) return null;

  // Remembered against the pair, so the same two names are not re-offered on
  // every visit. Reversible from either player's dialog.
  async function dismiss(s: Suggestion) {
    const id = s.key_a + s.key_b;
    setBusy(id);
    setError(null);
    const { error: err } = await supabase.rpc("dismiss_merge_suggestion", {
      p_workspace_id: workspaceId,
      p_key_a: s.key_a,
      p_key_b: s.key_b,
    });
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  }

  async function confirmMerge(sourceKey: string, targetKey: string) {
    if (!pending) return;
    const id = pending.key_a + pending.key_b;
    setBusy(id);
    setError(null);
    const { error: err } = await supabase.rpc("merge_workspace_players", {
      p_workspace_id: workspaceId,
      p_source_keys: [sourceKey],
      p_target_key: targetKey,
    });
    setBusy(null);
    setPending(null);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
    load();
  }

  return (
    <Box mb={2}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {rows.length > 0 && (
        <Button size="small" startIcon={<MergeIcon />} onClick={() => setOpen((o) => !o)}>
          {rows.length} possible duplicate{rows.length === 1 ? "" : "s"}
        </Button>
      )}

      <Collapse in={open}>
        <Box mt={1}>
          <Typography variant="body2" color="text.disabled" mb={1}>
            Names similar enough to be the same person. You choose which spelling survives.
            Both merging and &ldquo;not the same&rdquo; are remembered, and both can be undone
            from the player afterwards.
          </Typography>

          {rows.map((s) => {
            const id = s.key_a + s.key_b;
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
                <Chip size="small" label={`${s.name_a} · ${s.events_a}`} variant="outlined" />
                <Typography variant="caption" color="text.disabled">
                  and
                </Typography>
                <Chip size="small" label={`${s.name_b} · ${s.events_b}`} variant="outlined" />
                <Typography variant="caption" color="text.disabled" flexGrow={1}>
                  {(s.similarity * 100).toFixed(0)}% alike
                </Typography>
                {canEdit && (
                  <>
                    <Button size="small" disabled={busy === id} onClick={() => setPending(s)}>
                      Merge…
                    </Button>
                    <Button
                      size="small"
                      color="inherit"
                      disabled={busy === id}
                      onClick={() => void dismiss(s)}
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

      <MergeConfirmDialog
        a={
          pending
            ? ({
                identity_key: pending.key_a,
                display_name: pending.name_a,
                events_played: pending.events_a,
              } as MergeCandidate)
            : null
        }
        b={
          pending
            ? ({
                identity_key: pending.key_b,
                display_name: pending.name_b,
                events_played: pending.events_b,
              } as MergeCandidate)
            : null
        }
        busy={busy != null}
        onConfirm={(src, tgt) => void confirmMerge(src, tgt)}
        onCancel={() => setPending(null)}
      />
    </Box>
  );
}
