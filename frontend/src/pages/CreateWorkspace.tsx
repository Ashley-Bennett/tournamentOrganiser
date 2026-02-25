import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
  MenuItem,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";
import { slugify, randomSuffix } from "../utils/slugify";

const WORKSPACE_TYPES = [
  { value: "personal", label: "Personal" },
  { value: "club", label: "Club" },
  { value: "store", label: "Store" },
];

const CreateWorkspace = () => {
  const navigate = useNavigate();
  const { refreshWorkspaces } = useWorkspace();

  const [name, setName] = useState("");
  const [type, setType] = useState<"personal" | "club" | "store">("club");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const slugPreview = slugify(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!slugPreview) {
      setError("Name must contain at least one letter or number.");
      return;
    }

    setLoading(true);

    let slug = slugPreview;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: rpcError } = await supabase.rpc("create_workspace", {
        p_name: name.trim(),
        p_slug: slug,
        p_type: type,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (!rpcError) {
        refreshWorkspaces();
        navigate(`/w/${(data as { slug: string }).slug}/tournaments`);
        return;
      }

      // Unique slug violation — retry with a suffix
      if (rpcError.code === "23505") {
        slug = `${slugPreview}-${randomSuffix()}`;
        continue;
      }

      setError(rpcError.message);
      setLoading(false);
      return;
    }

    setError("Could not generate a unique slug. Please try a different name.");
    setLoading(false);
  };

  return (
    <Box maxWidth={480} mx="auto" mt={6}>
      <Typography variant="h4" gutterBottom>
        Create workspace
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        A workspace is your home for tournaments. You can create one for a
        store, club, or personal use.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
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
            helperText={
              slugPreview
                ? `URL: /w/${slugPreview}`
                : name
                  ? "Name must contain at least one letter or number"
                  : " "
            }
            error={!!name && !slugPreview}
          />

          <TextField
            select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            fullWidth
          >
            {WORKSPACE_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>

          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            fullWidth
          >
            {loading ? "Creating…" : "Create workspace"}
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

export default CreateWorkspace;
