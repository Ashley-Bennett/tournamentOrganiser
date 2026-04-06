import { useParams, useNavigate } from "react-router-dom";
import { Box, IconButton, Typography, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { QRCodeSVG } from "qrcode.react";
import { useWorkspace } from "../WorkspaceContext";
import { useAuth } from "../AuthContext";
import { useTournament } from "../hooks/useTournament";
export default function TournamentJoinDisplay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { wPath, workspace } = useWorkspace();
  const { user, loading: authLoading } = useAuth();

  const { tournament } = useTournament(
    id,
    user,
    authLoading,
    workspace?.id ?? null,
  );

  const joinUrl = tournament?.join_code
    ? `${window.location.origin}/join/c/${tournament.join_code}`
    : `${window.location.origin}/join`;

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      bgcolor="#111"
      color="#fff"
      gap={4}
      px={4}
    >
      <Tooltip title="Close">
        <IconButton
          onClick={() => navigate(wPath(`/tournaments/${id ?? ""}`))}
          sx={{ position: "absolute", top: 16, right: 16, color: "#fff" }}
        >
          <CloseIcon />
        </IconButton>
      </Tooltip>

      <Typography variant="h4" fontWeight={700} textAlign="center">
        Scan to join
        {tournament?.name ? `: ${tournament.name}` : ""}
      </Typography>

      <Box
        bgcolor="#fff"
        p={3}
        borderRadius={2}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <QRCodeSVG value={joinUrl} size={260} />
      </Box>

      {tournament?.join_code && (
        <Box textAlign="center">
          <Typography variant="caption" sx={{ opacity: 0.5, letterSpacing: 1 }}>
            ROOM CODE
          </Typography>
          <Typography
            variant="h2"
            fontWeight={800}
            sx={{ fontFamily: "monospace", letterSpacing: 6, lineHeight: 1.1 }}
          >
            {tournament.join_code}
          </Typography>
        </Box>
      )}

      <Typography
        variant="h2"
        fontWeight={800}
        sx={{
          fontFamily: "monospace",
          letterSpacing: 6,
          lineHeight: 1.1,
          opacity: 0.45,
          textAlign: "center",
          wordBreak: "break-all",
        }}
      >
        {`${window.location.host}/join`}
      </Typography>
    </Box>
  );
}
