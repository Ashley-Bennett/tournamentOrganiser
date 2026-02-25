import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";

const ClaimPlayer = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!user || !token || status !== "idle") return;

    setStatus("claiming");

    void (async () => {
      const { error } = await supabase.rpc("accept_player_claim_link", {
        p_token: token,
      });

      if (error) {
        setErrorMessage(error.message);
        setStatus("error");
        return;
      }

      setStatus("done");

      // Always redirect to /me — the player isn't a workspace member
      // and cannot view the tournament page directly.
      navigate("/me", { replace: true });
    })();
  }, [user, token, status, navigate]);

  // Not logged in — show claim landing with Login / Register options
  if (!authLoading && !user) {
    return (
      <Box maxWidth={480} mx="auto" mt={10} textAlign="center">
        <Typography variant="h5" gutterBottom>
          Link your player account
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={4}>
          Log in or create an account to link yourself to this tournament entry.
        </Typography>
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button
            variant="contained"
            onClick={() => navigate("/login", { state: { from: location } })}
          >
            Log in
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate("/register", { state: { from: location } })}
          >
            Create an account
          </Button>
        </Stack>
      </Box>
    );
  }

  if (authLoading || status === "idle" || status === "claiming") {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" mt={10} gap={2}>
        <CircularProgress />
        <Typography color="text.secondary">Linking your account…</Typography>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box maxWidth={480} mx="auto" mt={8}>
        <Typography variant="h5" gutterBottom>
          Could not link account
        </Typography>
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => navigate("/me")}>
            Go to my profile
          </Button>
          <Button variant="outlined" onClick={() => navigate("/")}>
            Home
          </Button>
        </Stack>
      </Box>
    );
  }

  return null;
};

export default ClaimPlayer;
