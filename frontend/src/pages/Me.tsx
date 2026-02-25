import { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Divider,
  Stack,
  TextField,
  Button,
  IconButton,
  Chip,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from "@mui/material";
import {
  PersonOutline as PersonIcon,
  EmojiEventsOutlined as TrophyIcon,
  WorkspacesOutlined as WorkspaceIcon,
  DeleteOutlined as DeleteIcon,
  PeopleOutlined as PeopleIcon,
  ContentCopy as CopyIcon,
  PersonRemoveOutlined as RemovePersonIcon,
} from "@mui/icons-material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { supabase } from "../supabaseClient";

interface MemberRow {
  user_id: string;
  role: string;
  display_name: string | null;
  created_at: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expires_at: string;
}

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

  // Workspace delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Members panel state — keyed by workspace id
  const [membersOpen, setMembersOpen] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<Record<string, MemberRow[]>>({});
  const [invites, setInvites] = useState<Record<string, InviteRow[]>>({});
  const [membersLoading, setMembersLoading] = useState<Record<string, boolean>>({});
  const [memberError, setMemberError] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [inviteLoading, setInviteLoading] = useState<Record<string, boolean>>({});
  const [inviteError, setInviteError] = useState<Record<string, string>>({});
  const [inviteSuccess, setInviteSuccess] = useState<Record<string, string>>({});
  const [copySuccess, setCopySuccess] = useState<Record<string, boolean>>({});

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

  // ── Members panel helpers ─────────────────────────────────────
  const loadMembers = async (workspaceId: string) => {
    setMembersLoading((prev) => ({ ...prev, [workspaceId]: true }));
    setMemberError((prev) => ({ ...prev, [workspaceId]: "" }));
    const [{ data: memberData, error: memberErr }, { data: inviteData }] =
      await Promise.all([
        supabase.rpc("get_workspace_members", { p_workspace_id: workspaceId }),
        supabase
          .from("workspace_invites")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("status", "pending"),
      ]);
    setMembersLoading((prev) => ({ ...prev, [workspaceId]: false }));
    if (memberErr) {
      setMemberError((prev) => ({ ...prev, [workspaceId]: memberErr.message }));
      return;
    }
    setMembers((prev) => ({ ...prev, [workspaceId]: (memberData as MemberRow[]) ?? [] }));
    setInvites((prev) => ({ ...prev, [workspaceId]: (inviteData as InviteRow[]) ?? [] }));
  };

  const toggleMembers = (workspaceId: string) => {
    const nowOpen = !membersOpen[workspaceId];
    setMembersOpen((prev) => ({ ...prev, [workspaceId]: nowOpen }));
    if (nowOpen && !members[workspaceId]) {
      void loadMembers(workspaceId);
    }
  };

  const handleInvite = async (workspaceId: string) => {
    const email = inviteEmail[workspaceId]?.trim();
    if (!email) {
      setInviteError((prev) => ({ ...prev, [workspaceId]: "Email is required." }));
      return;
    }
    setInviteLoading((prev) => ({ ...prev, [workspaceId]: true }));
    setInviteError((prev) => ({ ...prev, [workspaceId]: "" }));
    setInviteSuccess((prev) => ({ ...prev, [workspaceId]: "" }));
    const { error } = await supabase.rpc("create_workspace_invite", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_role: "admin",
    });
    setInviteLoading((prev) => ({ ...prev, [workspaceId]: false }));
    if (error) {
      setInviteError((prev) => ({ ...prev, [workspaceId]: error.message }));
      return;
    }
    setInviteEmail((prev) => ({ ...prev, [workspaceId]: "" }));
    setInviteSuccess((prev) => ({ ...prev, [workspaceId]: "Invite created." }));
    void loadMembers(workspaceId);
  };

  const handleRevoke = async (workspaceId: string, inviteId: string) => {
    await supabase.rpc("revoke_workspace_invite", { p_invite_id: inviteId });
    void loadMembers(workspaceId);
  };

  const handleRemoveMember = async (workspaceId: string, userId: string) => {
    const { error } = await supabase.rpc("remove_workspace_member", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
    });
    if (error) {
      setMemberError((prev) => ({ ...prev, [workspaceId]: error.message }));
      return;
    }
    void loadMembers(workspaceId);
  };

  const handleCopyLink = async (inviteId: string, token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    setCopySuccess((prev) => ({ ...prev, [inviteId]: true }));
    setTimeout(
      () => setCopySuccess((prev) => ({ ...prev, [inviteId]: false })),
      2000
    );
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", deleteTarget.id);
    setDeleteLoading(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setDeleteTarget(null);
    refreshWorkspaces();
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
          const canDelete = role === "owner";
          const isOnlyWorkspace = workspaces.length === 1;
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
                  <Chip label={role} size="small" color={ROLE_COLOR[role]} />
                )}
                {role && !isEditing && (
                  <Tooltip title={membersOpen[ws.id] ? "Hide members" : "Manage members"}>
                    <IconButton
                      size="small"
                      onClick={() => toggleMembers(ws.id)}
                      aria-label="Toggle members panel"
                      color={membersOpen[ws.id] ? "primary" : "default"}
                    >
                      <PeopleIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
                {canDelete && (
                  <Tooltip
                    title={
                      isOnlyWorkspace
                        ? "You can't delete your only workspace"
                        : "Delete workspace"
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={isOnlyWorkspace}
                        onClick={() =>
                          setDeleteTarget({ id: ws.id, name: ws.name })
                        }
                        aria-label={`Delete ${ws.name}`}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
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

              {/* ── Members panel ────────────────────────────────── */}
              {membersOpen[ws.id] && (
                <Box mt={2}>
                  <Divider sx={{ mb: 1.5 }} />

                  {membersLoading[ws.id] ? (
                    <Box display="flex" justifyContent="center" py={1}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : (
                    <>
                      {memberError[ws.id] && (
                        <Alert severity="error" sx={{ mb: 1 }}>
                          {memberError[ws.id]}
                        </Alert>
                      )}

                      {/* Member list */}
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        MEMBERS
                      </Typography>
                      <Stack spacing={0.5} mt={0.5} mb={1.5}>
                        {(members[ws.id] ?? []).map((m) => (
                          <Stack
                            key={m.user_id}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                          >
                            <Typography variant="body2" flexGrow={1}>
                              {m.display_name ?? m.user_id.slice(0, 8) + "…"}
                            </Typography>
                            <Chip
                              label={m.role}
                              size="small"
                              color={ROLE_COLOR[m.role as Role] ?? "default"}
                            />
                            {/* Only owner can remove; never show for the owner row */}
                            {role === "owner" && m.role !== "owner" && (
                              <Tooltip title="Remove member">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() =>
                                    void handleRemoveMember(ws.id, m.user_id)
                                  }
                                  aria-label={`Remove ${m.display_name ?? m.user_id}`}
                                >
                                  <RemovePersonIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        ))}
                      </Stack>

                      {/* Invite form — owner only for MVP */}
                      {role === "owner" && (
                        <>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            fontWeight={600}
                          >
                            INVITE AS ADMIN
                          </Typography>
                          <Stack direction="row" spacing={1} mt={0.5} mb={1.5}>
                            <TextField
                              size="small"
                              label="Email address"
                              type="email"
                              value={inviteEmail[ws.id] ?? ""}
                              onChange={(e) =>
                                setInviteEmail((prev) => ({
                                  ...prev,
                                  [ws.id]: e.target.value,
                                }))
                              }
                              sx={{ flexGrow: 1 }}
                            />
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={!!inviteLoading[ws.id]}
                              onClick={() => void handleInvite(ws.id)}
                            >
                              {inviteLoading[ws.id] ? "Sending…" : "Invite"}
                            </Button>
                          </Stack>
                          {inviteError[ws.id] && (
                            <Alert severity="error" sx={{ mb: 1 }}>
                              {inviteError[ws.id]}
                            </Alert>
                          )}
                          {inviteSuccess[ws.id] && (
                            <Alert severity="success" sx={{ mb: 1 }}>
                              {inviteSuccess[ws.id]}
                            </Alert>
                          )}
                        </>
                      )}

                      {/* Pending invites — visible to managers (RLS gates this) */}
                      {(invites[ws.id] ?? []).length > 0 && (
                        <>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            fontWeight={600}
                          >
                            PENDING INVITES
                          </Typography>
                          <Stack spacing={0.5} mt={0.5}>
                            {invites[ws.id].map((inv) => (
                              <Stack
                                key={inv.id}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                              >
                                <Typography variant="body2" flexGrow={1}>
                                  {inv.email}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  expires{" "}
                                  {new Date(inv.expires_at).toLocaleDateString()}
                                </Typography>
                                <Tooltip
                                  title={copySuccess[inv.id] ? "Copied!" : "Copy invite link"}
                                >
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      void handleCopyLink(inv.id, inv.token)
                                    }
                                    color={copySuccess[inv.id] ? "success" : "default"}
                                    aria-label="Copy invite link"
                                  >
                                    <CopyIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Button
                                  size="small"
                                  color="error"
                                  onClick={() => void handleRevoke(ws.id, inv.id)}
                                >
                                  Revoke
                                </Button>
                              </Stack>
                            ))}
                          </Stack>
                        </>
                      )}
                    </>
                  )}
                </Box>
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

      {/* ── Delete confirmation dialog ───────────────────────── */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
      >
        <DialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>
            This will permanently delete the workspace and{" "}
            <strong>all tournaments, matches, and player data</strong> inside
            it. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteTarget(null);
              setDeleteError("");
            }}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteLoading}
            onClick={() => void handleDeleteConfirm()}
          >
            {deleteLoading ? "Deleting…" : "Delete workspace"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Me;
