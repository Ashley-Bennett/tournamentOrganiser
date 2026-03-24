import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
  Alert,
  Paper,
} from "@mui/material";
import { supabase } from "../supabaseClient";

export default function JoinLanding() {
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(urlCode?.toUpperCase() ?? "");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlCode) void handleGo(urlCode.toUpperCase());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  const handleGo = async (overrideCode?: string) => {
    const trimmed = (overrideCode ?? code).trim().toUpperCase();
    if (!trimmed) return;

    setLooking(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("resolve_join_code", {
      p_code: trimmed,
    });

    setLooking(false);

    if (rpcError) {
      setError("Something went wrong. Please try again.");
      return;
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) {
      setError("No open tournament found with that code. Check the code and try again.");
      return;
    }

    navigate(`/join/${(row as { tournament_id: string }).tournament_id}`);
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      px={2}
    >
      <Paper sx={{ p: 4, maxWidth: 400, width: "100%" }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Join a Tournament
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Enter the room code shown on the screen.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Room code"
          fullWidth
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") void handleGo(); }}
          disabled={looking}
          inputProps={{ style: { fontFamily: "monospace", letterSpacing: 2, fontSize: "1.25rem" } }}
          sx={{ mb: 2 }}
        />

        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={() => void handleGo()}
          disabled={looking || !code.trim()}
        >
          {looking ? <CircularProgress size={22} /> : "Go"}
        </Button>
      </Paper>
    </Box>
  );
}
