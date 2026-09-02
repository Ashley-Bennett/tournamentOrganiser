import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useNotifications, useUnreadTitle } from "../hooks/useNotifications";
import type { StoredNotification } from "../utils/notificationStore";
import { relativeTime } from "../utils/relativeTime";

const TEXT_MUTED = "rgba(255,255,255,0.6)";

function subtitle(n: StoredNotification, now: number): string {
  const when = relativeTime(n.createdAt, now);
  return n.tournamentName ? `${n.tournamentName} · ${when}` : when;
}

export default function NotificationBell({
  showWhenEmpty = false,
}: {
  /** Signed-in users always see the bell; anonymous players only once they have something. */
  showWhenEmpty?: boolean;
}) {
  const navigate = useNavigate();
  const { items, unread, markRead, markAllRead, clearAll } = useNotifications();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  useUnreadTitle(unread);

  if (items.length === 0 && !showWhenEmpty) return null;

  const now = Date.now();

  const openRow = (n: StoredNotification) => {
    // Reading happens on tap, not on opening the panel — otherwise glancing at
    // the list silently clears everything the player hasn't actually seen.
    markRead(n.id);
    setAnchorEl(null);
    navigate(n.href);
  };

  const label =
    unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          aria-label={label}
          sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
        >
          <Badge
            badgeContent={unread}
            max={9}
            color="error"
            overlap="circular"
          >
            <NotificationsNoneIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: "calc(100vw - 24px)" } } }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            Notifications
          </Typography>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Button
              size="small"
              onClick={markAllRead}
              disabled={unread === 0}
              sx={{ textTransform: "none" }}
            >
              Mark all read
            </Button>
            <Button
              size="small"
              onClick={clearAll}
              disabled={items.length === 0}
              color="inherit"
              sx={{ textTransform: "none", color: "text.secondary" }}
            >
              Clear
            </Button>
          </Box>
        </Box>
        <Divider />

        {items.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              You&apos;re all caught up. Round updates will show up here.
            </Typography>
          </Box>
        ) : (
          <List disablePadding sx={{ maxHeight: 380, overflowY: "auto" }}>
            {items.map((n) => (
              <ListItem key={n.id} disablePadding>
                <ListItemButton
                  onClick={() => openRow(n)}
                  sx={{
                    alignItems: "flex-start",
                    bgcolor: n.readAt === null ? "action.hover" : "transparent",
                  }}
                >
                  <ListItemText
                    primary={n.message}
                    secondary={subtitle(n, now)}
                    primaryTypographyProps={{
                      fontSize: "0.875rem",
                      fontWeight: n.readAt === null ? 600 : 400,
                    }}
                    secondaryTypographyProps={{ fontSize: "0.75rem" }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}
