import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabaseClient";

interface Props {
  open: boolean;
  playerId: string | null;
  playerName: string;
  onClose: () => void;
}

/**
 * Organiser-facing dialog that mints a one-time claim link for a player entry
 * the organiser created (or that was never linked to an account).
 *
 * The player opens the link, signs in or registers, and `accept_player_claim_link`
 * sets `tournament_players.user_id` — which now grants real access to the player
 * portal via `assert_player_access`.
 *
 * Creating a link revokes any previous pending link for the same player, so the
 * dialog mints on open rather than caching.
 */
export default function PlayerClaimLinkDialog({
  open,
  playerId,
  playerName,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const claimUrl = token ? `${window.location.origin}/claim/${token}` : "";

  const createLink = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    setToken(null);

    const { data, error: rpcError } = await supabase.rpc("create_player_claim_link", {
      p_tournament_player_id: playerId,
    });

    if (rpcError) {
      setError(rpcError.message || "Failed to create a link.");
      setLoading(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    setToken((row as { token: string } | null)?.token ?? null);
    setLoading(false);
  }, [playerId]);

  useEffect(() => {
    if (!open) {
      setToken(null);
      setError(null);
      setCopied(false);
      return;
    }
    void createLink();
  }, [open, createLink]);

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(claimUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Couldn't copy. Select the link and copy it manually."));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Link {playerName} to an account</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Send this link to {playerName}. Once they open it and sign in, this entry
          becomes theirs. They&apos;ll see their pairings, report their own results,
          and get round notifications on their phone, including for tournaments that
          have already started.
        </Typography>

        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {token && (
          <>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <TextField
                fullWidth
                size="small"
                value={claimUrl}
                InputProps={{ readOnly: true }}
                onFocus={(e) => e.target.select()}
              />
              <Tooltip title={copied ? "Copied!" : "Copy link"}>
                <IconButton size="small" onClick={handleCopy} aria-label="Copy claim link">
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>

            <Box display="flex" justifyContent="center" mb={2}>
              <Box sx={{ p: 2, bgcolor: "#fff", borderRadius: 1 }}>
                <QRCodeSVG value={claimUrl} size={200} />
              </Box>
            </Box>

            <Alert severity="info">
              Single use, expires in 14 days. Anyone who opens it claims the entry,
              so share it with {playerName} directly. Generating a new link cancels
              this one.
            </Alert>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {token && (
          <Button onClick={() => void createLink()} disabled={loading}>
            Generate new link
          </Button>
        )}
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
