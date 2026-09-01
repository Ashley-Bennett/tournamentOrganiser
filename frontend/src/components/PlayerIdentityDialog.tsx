import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import MergeIcon from "@mui/icons-material/Merge";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import UndoIcon from "@mui/icons-material/Undo";
import { supabase } from "../supabaseClient";
import PickerDialog, { type PickerItem } from "./PickerDialog";

/**
 * Review and correct one player identity.
 *
 * The stats guess who is who from names, and get it wrong in two directions:
 * one person spread across spellings, or two people sharing a name. This shows
 * the raw entries behind an identity so an organiser can do either correction —
 * merge this person into another, or peel entries off into their own person.
 *
 * Everything here is reversible: "Undo corrections" drops the manual overrides
 * and returns the entries to whatever the automatic rules say.
 */

export interface IdentityOption {
  identity_key: string;
  display_name: string;
  events_played: number;
}

interface EntryRow {
  tournament_player_id: string;
  entry_name: string;
  tournament_name: string;
  played_at: string;
  is_overridden: boolean;
}

export default function PlayerIdentityDialog({
  workspaceId,
  identity,
  allIdentities,
  canEdit,
  onClose,
  onChanged,
}: {
  workspaceId: string;
  /** null closes the dialog. */
  identity: IdentityOption | null;
  allIdentities: IdentityOption[];
  canEdit: boolean;
  onClose: () => void;
  /** Called after any change, so the page can refetch. */
  onChanged: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);

  const open = identity != null;
  const key = identity?.identity_key ?? null;

  const load = useCallback(() => {
    if (!key) return;
    setLoading(true);
    void supabase
      .rpc("get_workspace_player_entries", {
        p_workspace_id: workspaceId,
        p_identity_key: key,
      })
      .then(({ data, error: err }) => {
        setEntries((data ?? []) as EntryRow[]);
        setError(err?.message ?? null);
        setLoading(false);
      });
  }, [workspaceId, key]);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setError(null);
    load();
  }, [open, load]);

  const overriddenCount = entries.filter((e) => e.is_overridden).length;

  const mergeItems: PickerItem[] = useMemo(
    () =>
      allIdentities
        .filter((p) => p.identity_key !== key)
        .map((p) => ({
          id: p.identity_key,
          label: p.display_name,
          secondary: `${p.events_played} event${p.events_played === 1 ? "" : "s"}`,
        })),
    [allIdentities, key],
  );

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
    onClose();
  }

  function mergeInto(targetKey: string) {
    if (!key) return;
    void run(() =>
      supabase.rpc("merge_workspace_players", {
        p_workspace_id: workspaceId,
        p_source_keys: [key],
        p_target_key: targetKey,
      }),
    );
  }

  function splitSelected() {
    void run(() =>
      supabase.rpc("split_workspace_player_entries", {
        p_workspace_id: workspaceId,
        p_entry_ids: selected,
      }),
    );
  }

  function undoAll() {
    void run(() =>
      supabase.rpc("unlink_workspace_player_entries", {
        p_workspace_id: workspaceId,
        p_entry_ids: entries.map((e) => e.tournament_player_id),
      }),
    );
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          {identity?.display_name ?? "Player"}
          <IconButton
            onClick={onClose}
            sx={{ position: "absolute", right: 8, top: 8 }}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" mb={1.5}>
            {loading
              ? "Loading entries…"
              : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} counted as this person.` +
                (overriddenCount > 0 ? ` ${overriddenCount} set by hand.` : "")}
          </Typography>

          {loading ? (
            <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
          ) : (
            <List dense disablePadding>
              {entries.map((e) => {
                const checked = selected.includes(e.tournament_player_id);
                return (
                  <ListItemButton
                    key={e.tournament_player_id}
                    dense
                    disabled={!canEdit}
                    onClick={() =>
                      setSelected((cur) =>
                        checked
                          ? cur.filter((x) => x !== e.tournament_player_id)
                          : [...cur, e.tournament_player_id],
                      )
                    }
                  >
                    <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple size="small" />
                    <ListItemText
                      primary={e.entry_name}
                      secondary={`${e.tournament_name} · ${new Date(e.played_at).toLocaleDateString()}`}
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                    {e.is_overridden && <Chip label="By hand" size="small" variant="outlined" />}
                  </ListItemButton>
                );
              })}
            </List>
          )}

          {canEdit && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box display="flex" flexWrap="wrap" gap={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<MergeIcon />}
                  disabled={busy || mergeItems.length === 0}
                  onClick={() => setMergePickerOpen(true)}
                >
                  Merge into another player
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CallSplitIcon />}
                  disabled={busy || selected.length === 0 || selected.length === entries.length}
                  onClick={splitSelected}
                >
                  Separate {selected.length > 0 ? `${selected.length} ` : ""}selected
                </Button>
                {overriddenCount > 0 && (
                  <Button
                    size="small"
                    startIcon={<UndoIcon />}
                    disabled={busy}
                    onClick={undoAll}
                  >
                    Undo corrections
                  </Button>
                )}
              </Box>
              {selected.length > 0 && selected.length === entries.length && (
                <Typography variant="caption" color="text.disabled" display="block" mt={1}>
                  Separating every entry would leave nobody behind — leave at least one unselected.
                </Typography>
              )}
            </>
          )}

          {!canEdit && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Only workspace owners and admins can correct player identities.
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <PickerDialog
        open={mergePickerOpen}
        title={`Merge ${identity?.display_name ?? ""} into…`}
        items={mergeItems}
        selected={[]}
        multi={false}
        searchPlaceholder="Search players"
        onApply={(ids) => ids[0] && mergeInto(ids[0])}
        onClose={() => setMergePickerOpen(false)}
      />
    </>
  );
}
