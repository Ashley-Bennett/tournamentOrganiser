import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";

const WorkspaceSettings = () => {
  const navigate = useNavigate();
  const { workspace, workspaceId, currentRole, refreshWorkspaces } =
    useWorkspace();

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
    }
  }, [workspace]);

  const canManage = currentRole === "owner" || currentRole === "admin";

  if (!canManage) {
    return (
      <Box maxWidth={480} mx="auto" mt={6} textAlign="center">
        <Typography variant="h5" gutterBottom>
          Access denied
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={3}>
          You don't have permission to manage this workspace.
        </Typography>
        <Button variant="outlined" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </Box>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Workspace name is required.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({
        name: name.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .eq("id", workspaceId);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    refreshWorkspaces();
    setSuccess("Settings saved.");
  };

  return (
    <Box maxWidth={480} mx="auto" mt={6}>
      <Typography variant="h4" gutterBottom>
        Workspace settings
      </Typography>
      {workspace && (
        <Typography variant="body2" color="text.secondary" mb={3}>
          {workspace.slug} · {workspace.type}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Stack spacing={2}>
          <TextField
            label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
          />
          <Typography variant="body2" color="text.secondary">
            Slug: <strong>{workspace?.slug}</strong> (cannot be changed)
          </Typography>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            fullWidth
          >
            {loading ? "Saving…" : "Save settings"}
          </Button>
          <Button
            variant="text"
            onClick={() => navigate(-1)}
            sx={{ color: "text.secondary" }}
          >
            Cancel
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default WorkspaceSettings;
