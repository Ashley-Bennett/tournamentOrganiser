import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

export type SupabaseErrorType = "network" | "paused" | "error";

interface Props {
  type: SupabaseErrorType;
  detail?: string;
  onRetry: () => void;
}

const configs: Record<
  SupabaseErrorType,
  { icon: React.ReactNode; title: string; body: string; steps?: string[] }
> = {
  network: {
    icon: <CloudOffIcon sx={{ fontSize: 64, color: "warning.main" }} />,
    title: "Can't reach the server",
    body: "The app couldn't connect to Supabase. This is usually a network issue.",
    steps: [
      "Check your internet connection",
      "If you're online, the server may be temporarily unavailable — try again in a moment",
    ],
  },
  paused: {
    icon: <PauseCircleOutlineIcon sx={{ fontSize: 64, color: "info.main" }} />,
    title: "Database is paused",
    body: "The Supabase project has been paused due to inactivity (free-tier projects pause after 7 days of no activity).",
    steps: [
      'Go to supabase.com and sign in to the project dashboard',
      'Find this project and click "Restore" or "Resume"',
      "Wait 1–2 minutes for it to wake up, then click Retry below",
    ],
  },
  error: {
    icon: <ErrorOutlineIcon sx={{ fontSize: 64, color: "error.main" }} />,
    title: "Something went wrong",
    body: "An unexpected error occurred while connecting to the database.",
  },
};

export default function SupabaseErrorScreen({ type, detail, onRetry }: Props) {
  const { icon, title, body, steps } = configs[type];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
        bgcolor: "background.default",
      }}
    >
      <Paper elevation={3} sx={{ maxWidth: 500, width: "100%", p: 4 }}>
        <Stack spacing={3} alignItems="center" textAlign="center">
          {icon}
          <Typography variant="h5" fontWeight={600}>
            {title}
          </Typography>
          <Typography color="text.secondary">{body}</Typography>
          {steps && (
            <Box sx={{ textAlign: "left", width: "100%" }}>
              <Typography variant="subtitle2" gutterBottom>
                How to fix it:
              </Typography>
              <Stack
                component="ol"
                spacing={0.75}
                sx={{ pl: 2.5, m: 0 }}
              >
                {steps.map((step, i) => (
                  <Typography
                    component="li"
                    key={i}
                    variant="body2"
                    color="text.secondary"
                  >
                    {step}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
          {detail && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
            >
              {detail}
            </Typography>
          )}
          <Button
            variant="contained"
            onClick={onRetry}
            size="large"
            sx={{ mt: 1 }}
          >
            Retry
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
