import { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Divider,
  Stack,
  TextField,
  Button,
  Chip,
  Alert,
} from "@mui/material";
import {
  PersonOutline as PersonIcon,
  EmojiEventsOutlined as TrophyIcon,
  WorkspacesOutlined as WorkspaceIcon,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { supabase } from "../supabaseClient";

type Role = "owner" | "admin" | "judge" | "staff";
const ROLE_COLOR: Record<Role, "primary" | "secondary" | "info" | "default"> = {
  owner: "primary",
  admin: "secondary",
  judge: "info",
  staff: "default",
};

const Me = () => {
  const { user, profile, displayName, updateProfile } = useAuth();
  const { workspaces, roleFor, refreshWorkspaces } = useWorkspace();

  // Account edit state
  const [editName, setEditName] = useState<string | null>(null);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState("");

  // Workspace edit state — keyed by workspace id
  const [wsEdit, setWsEdit] = useState<Record<string, string>>({});
  const [wsLoading, setWsLoading] = useState<Record<string, boolean>>({});
  const [wsError, setWsError] = useState<Record<string, string>>({});
  const [wsSuccess, setWsSuccess] = useState<Record<string, string>>({});

  const handleNameSave = async () => {
    if (editName === null) return;
    setNameError("");
    setNameSuccess("");
    if (!editName.trim()) {
      setNameError("Name cannot be empty.");
      return;
    }
    setNameLoading(true);
    try {
      await updateProfile({ display_name: editName.trim() });
      setEditName(null);
      setNameSuccess("Name updated.");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setNameLoading(false);
    }
  };

  const handleWsSave = async (workspaceId: string) => {
    const name = wsEdit[workspaceId];
    if (!name?.trim()) {
      setWsError((prev) => ({ ...prev, [workspaceId]: "Name cannot be empty." }));
      return;
    }
    setWsLoading((prev) => ({ ...prev, [workspaceId]: true }));
    setWsError((prev) => ({ ...prev, [workspaceId]: "" }));
    const { error } = await supabase
      .from("workspaces")
      .update({
        name: name.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .eq("id", workspaceId);
    setWsLoading((prev) => ({ ...prev, [workspaceId]: false }));
    if (error) {
      setWsError((prev) => ({ ...prev, [workspaceId]: error.message }));
      return;
    }
    refreshWorkspaces();
    setWsEdit((prev) => {
      const next = { ...prev };
      delete next[workspaceId];
      return next;
    });
    setWsSuccess((prev) => ({ ...prev, [workspaceId]: "Saved." }));
  };

  return (
    <Box maxWidth={640} mx="auto" mt={4}>
      <Typography variant="h4" gutterBottom>
        My Profile
      </Typography>

      {/* ── Account ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
        <Stack direction="row" spacing={2} alignItems="center" mb={editName !== null ? 2 : 0}>
          <PersonIcon sx={{ fontSize: 40, color: "text.secondary" }} />
          <Box flexGrow={1}>
            <Typography variant="h6">{displayName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
          </Box>
          {editName === null && (
            <Button
              size="small"
              onClick={() => setEditName(profile?.display_name ?? "")}
            >
              Edit
            </Button>
          )}
        </Stack>

        {editName !== null && (
          <Stack spacing={1}>
            {nameError && <Alert severity="error">{nameError}</Alert>}
            <TextField
              label="Display name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              size="small"
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                size="small"
                disabled={nameLoading}
                onClick={() => void handleNameSave()}
              >
                {nameLoading ? "Saving…" : "Save"}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setEditName(null);
                  setNameError("");
                  setNameSuccess("");
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        )}

        {nameSuccess && editName === null && (
          <Alert severity="success" sx={{ mt: 1 }}>
            {nameSuccess}
          </Alert>
        )}
      </Paper>

      {/* ── Workspaces ──────────────────────────────────────── */}
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <WorkspaceIcon sx={{ color: "text.secondary" }} />
        <Typography variant="h6">My Workspaces</Typography>
      </Stack>

      <Stack spacing={2} mb={3}>
        {workspaces.map((ws) => {
          const role = roleFor(ws.id) as Role | null;
          const canManage = role === "owner" || role === "admin";
          const isEditing = ws.id in wsEdit;

          return (
            <Paper key={ws.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                mb={isEditing ? 1.5 : 0}
              >
                <Box flexGrow={1}>
                  <Typography variant="subtitle1" fontWeight={500}>
                    {ws.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ws.slug} · {ws.type}
                  </Typography>
                </Box>
                {role && (
                  <Chip
                    label={role}
                    size="small"
                    color={ROLE_COLOR[role]}
                  />
                )}
                {canManage && !isEditing && (
                  <Button
                    size="small"
                    onClick={() =>
                      setWsEdit((prev) => ({ ...prev, [ws.id]: ws.name }))
                    }
                  >
                    Edit
                  </Button>
                )}
              </Stack>

              {isEditing && (
                <Stack spacing={1}>
                  {wsError[ws.id] && (
                    <Alert severity="error">{wsError[ws.id]}</Alert>
                  )}
                  <TextField
                    label="Workspace name"
                    value={wsEdit[ws.id]}
                    onChange={(e) =>
                      setWsEdit((prev) => ({ ...prev, [ws.id]: e.target.value }))
                    }
                    size="small"
                    fullWidth
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={wsLoading[ws.id]}
                      onClick={() => void handleWsSave(ws.id)}
                    >
                      {wsLoading[ws.id] ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setWsEdit((prev) => {
                          const next = { ...prev };
                          delete next[ws.id];
                          return next;
                        });
                        setWsError((prev) => ({ ...prev, [ws.id]: "" }));
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              )}

              {wsSuccess[ws.id] && !isEditing && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  {wsSuccess[ws.id]}
                </Alert>
              )}
            </Paper>
          );
        })}

        <Button
          variant="outlined"
          component={RouterLink}
          to="/workspaces/new"
          sx={{ alignSelf: "flex-start" }}
        >
          + New workspace
        </Button>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* ── My Tournaments ──────────────────────────────────── */}
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <TrophyIcon sx={{ color: "text.secondary" }} />
        <Typography variant="h6">My Tournaments</Typography>
      </Stack>

      <Paper
        variant="outlined"
        sx={{ p: 4, textAlign: "center", backgroundColor: "action.hover" }}
      >
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No tournament history yet.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your match history will appear here once your entries are linked to
          your account. Ask the tournament organiser to link you, or claim
          entries from a past event.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Me;
