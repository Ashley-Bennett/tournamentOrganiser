import React from "react";
import { Button, Box, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface TournamentPageHeaderProps {
  title: string;
  onBack: () => void;
  backLabel?: string;
}

const TournamentPageHeader: React.FC<TournamentPageHeaderProps> = ({
  title,
  onBack,
  backLabel = "Back",
}) => (
  <Box display="flex" alignItems="center" mb={3}>
    <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mr: 2 }}>
      {backLabel}
    </Button>
    <Typography variant="h4" component="h1">
      {title}
    </Typography>
  </Box>
);

export default TournamentPageHeader;
