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
import { useWorkspace } from "../WorkspaceContext";
import { supabase } from "../supabaseClient";

const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { refreshWorkspaces } = useWorkspace();

  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Auth loading state handled in render — no auto-redirect for unauthenticated users.
  // Instead we show a landing page with Login / Register CTAs.

  // Accept the invite once we have a logged-in user
  useEffect(() => {
    if (!user || !token || status !== "idle") return;

    setStatus("accepting");

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Please try again.")), 30_000),
    );

    void (async () => {
      try {
        const { data: workspaceId, error } = await Promise.race([
          supabase.rpc("accept_workspace_invite", { p_token: token }),
          timeout,
        ]);

        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          return;
        }

        const { data: ws, error: wsError } = await Promise.race([
          supabase.from("workspaces").select("slug").eq("id", workspaceId as string).single(),
          timeout,
        ]);

        if (wsError || !ws) {
          setErrorMessage("Joined workspace but could not determine its URL.");
          setStatus("error");
          return;
        }

        refreshWorkspaces();
        setStatus("done");
        navigate(`/w/${ws.slug}/tournaments`, { replace: true });
      } catch (e: unknown) {
        setErrorMessage(e instanceof Error ? e.message : "Something went wrong.");
        setStatus("error");
      }
    })();
  }, [user, token, status, navigate, refreshWorkspaces]);

  // Not logged in — show invite landing with Login / Register options
  if (!authLoading && !user) {
    return (
      <Box maxWidth={480} mx="auto" mt={10} textAlign="center">
        <Typography variant="h5" gutterBottom>
          You've been invited to a workspace
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={4}>
          Log in to your existing account or create a new one to accept the invite.
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

  if (authLoading || status === "idle" || status === "accepting") {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" mt={10} gap={2}>
        <CircularProgress />
        <Typography color="text.secondary">Joining workspace…</Typography>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box maxWidth={480} mx="auto" mt={8}>
        <Typography variant="h5" gutterBottom>
          Could not accept invite
        </Typography>
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => navigate("/me")}>
            Go to my workspaces
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

export default AcceptInvite;
