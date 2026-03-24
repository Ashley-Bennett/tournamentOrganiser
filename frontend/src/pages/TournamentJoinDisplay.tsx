import { useParams, useNavigate } from "react-router-dom";
import { Box, IconButton, Typography, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { QRCodeSVG } from "qrcode.react";
import { useWorkspace } from "../WorkspaceContext";

export default function TournamentJoinDisplay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { wPath } = useWorkspace();

  const joinUrl = `${window.location.origin}/join/${id ?? ""}`;

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
        Scan to join the tournament
      </Typography>

      <Box
        bgcolor="#fff"
        p={3}
        borderRadius={2}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <QRCodeSVG value={joinUrl} size={280} />
      </Box>

      <Typography
        variant="body1"
        sx={{ fontFamily: "monospace", opacity: 0.7, wordBreak: "break-all", textAlign: "center" }}
      >
        {joinUrl}
      </Typography>
    </Box>
  );
}
