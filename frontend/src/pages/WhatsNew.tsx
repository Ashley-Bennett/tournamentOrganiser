import {
  Box,
  Typography,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import {
  NewReleases as NewReleasesIcon,
} from "@mui/icons-material";
import patchNotes from "../data/patchNotes";

const categoryColour: Record<string, "primary" | "success" | "warning" | "default"> = {
  "New Features": "primary",
  "Workspaces": "success",
  "Tournaments": "warning",
  "Fixes & Polish": "default",
};

const WhatsNew = () => {
  return (
    <Box maxWidth={680} mx="auto">
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <NewReleasesIcon color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h4" component="h1">
          What's New
        </Typography>
      </Box>

      {patchNotes.map((release, i) => (
        <Box key={release.version} mb={5}>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Typography variant="h6" fontWeight="bold">
              v{release.version}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {new Date(release.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Typography>
          </Box>

          {release.entries.map((section) => (
            <Box key={section.category} mb={2}>
              <Chip
                label={section.category}
                size="small"
                color={categoryColour[section.category] ?? "default"}
                sx={{ mb: 1 }}
              />
              <List dense disablePadding>
                {section.items.map((item, j) => (
                  <ListItem key={j} sx={{ py: 0.25, pl: 1 }}>
                    <ListItemText
                      primary={item}
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ))}

          {i < patchNotes.length - 1 && <Divider sx={{ mt: 3 }} />}
        </Box>
      ))}
    </Box>
  );
};

export default WhatsNew;
