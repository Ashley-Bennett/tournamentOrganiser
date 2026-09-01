import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

/**
 * Confirms a merge, and lets the direction be reversed first.
 *
 * A merge picks a survivor: their name is what everyone sees afterwards. The
 * app can only guess at that from event counts, and when two spellings have the
 * same count the guess is arbitrary — an abbreviation could end up absorbing
 * the full name. Only the organiser knows which spelling is the real one, so
 * the direction is stated in words and is swappable before anything happens.
 */

export interface MergeCandidate {
  identity_key: string;
  display_name: string;
  events_played: number;
}

export default function MergeConfirmDialog({
  a,
  b,
  busy,
  onConfirm,
  onCancel,
}: {
  /** The pair to merge. null closes the dialog. */
  a: MergeCandidate | null;
  b: MergeCandidate | null;
  busy?: boolean;
  /** Called with the loser and the survivor, in that order. */
  onConfirm: (sourceKey: string, targetKey: string) => void;
  onCancel: () => void;
}) {
  // Default: the busier history absorbs the stray, which is right far more
  // often than not. Equal counts fall back to `a`, and that is exactly the
  // case the swap exists for.
  const [targetIsA, setTargetIsA] = useState(true);

  const open = a != null && b != null;

  useEffect(() => {
    if (open && a && b) setTargetIsA(a.events_played >= b.events_played);
  }, [open, a, b]);

  if (!a || !b) return null;

  const target = targetIsA ? a : b;
  const source = targetIsA ? b : a;

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Merge players</DialogTitle>
      <DialogContent dividers>
        <Box display="flex" alignItems="center" justifyContent="center" gap={1.5} flexWrap="wrap" mb={2}>
          <Chip
            label={`${source.display_name} · ${source.events_played}`}
            variant="outlined"
            sx={{ textDecoration: "line-through", opacity: 0.7 }}
          />
          <ArrowForwardIcon fontSize="small" color="disabled" />
          <Chip label={`${target.display_name} · ${target.events_played}`} color="primary" />
        </Box>

        <Typography variant="body2" mb={1}>
          <strong>{source.display_name}</strong>&apos;s entries will be counted as{" "}
          <strong>{target.display_name}</strong>, who will have{" "}
          {source.events_played + target.events_played} event
          {source.events_played + target.events_played === 1 ? "" : "s"} in total.
        </Typography>

        <Typography variant="body2" color="text.secondary" mb={2}>
          <strong>{target.display_name}</strong> is the spelling that will be shown from now on.
          If that is the wrong way round, swap it.
        </Typography>

        <Button
          size="small"
          startIcon={<SwapHorizIcon />}
          onClick={() => setTargetIsA((v) => !v)}
          disabled={busy}
        >
          Swap — keep {source.display_name} instead
        </Button>

        <Alert severity="info" sx={{ mt: 2 }}>
          This changes attendance, the league table and the meta share for everyone in the
          workspace. You can undo it from the merged player afterwards.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => onConfirm(source.identity_key, target.identity_key)}
        >
          Merge
        </Button>
      </DialogActions>
    </Dialog>
  );
}
