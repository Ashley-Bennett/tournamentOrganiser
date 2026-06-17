import React from "react";
import { Box, Typography } from "@mui/material";

interface LiveIndicatorProps {
  isLive: boolean;
}

export default function LiveIndicator({ isLive }: LiveIndicatorProps) {
  return (
    <Box display="inline-flex" alignItems="center" gap={0.75}>
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: isLive ? "success.main" : "text.disabled",
          ...(isLive && {
            animation: "live-pulse 2s ease-in-out infinite",
            "@keyframes live-pulse": {
              "0%, 100%": { opacity: 1 },
              "50%": { opacity: 0.35 },
            },
          }),
        }}
      />
      <Typography
        variant="caption"
        color={isLive ? "success.main" : "text.disabled"}
      >
        {isLive ? "Live" : "Reconnecting…"}
      </Typography>
    </Box>
  );
}
