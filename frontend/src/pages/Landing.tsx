import {
  Box,
  Button,
  Container,
  Grid,
  Typography,
  Stack,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Link } from "react-router-dom";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useThemeMode } from "../ThemeContext";
import GroupsIcon from "@mui/icons-material/Groups";
import ShareIcon from "@mui/icons-material/Share";
import SpeedIcon from "@mui/icons-material/Speed";
import CheckIcon from "@mui/icons-material/Check";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

const BG = "#060e1d";
const CARD_BG = "rgba(255,255,255,0.04)";
const ACCENT = "#dc004e";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_MUTED = "rgba(255,255,255,0.6)";

function ScreenshotFrame({
  src,
  alt,
  sx = {},
}: {
  src: string;
  alt: string;
  sx?: object;
}) {
  return (
    <Box
      sx={{
        borderRadius: "12px",
        overflow: "hidden",
        border: `1px solid ${BORDER}`,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        ...sx,
      }}
    >
      <Box
        sx={{
          bgcolor: "#111d35",
          px: 2,
          py: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
          <Box
            key={c}
            sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c, flexShrink: 0 }}
          />
        ))}
      </Box>
      <Box
        component="img"
        src={src}
        alt={alt}
        sx={{ width: "100%", display: "block" }}
      />
    </Box>
  );
}

const features = [
  {
    icon: <SpeedIcon fontSize="large" />,
    title: "Swiss & Single Elimination",
    desc: "Auto-generate pairings for any format. Swiss rounds handle byes and rematches automatically — no manual work.",
  },
  {
    icon: <LeaderboardIcon fontSize="large" />,
    title: "Live Standings & Tiebreakers",
    desc: "OMW%, OOMW%, and record calculated in real time every time a result is entered. No spreadsheets needed.",
  },
  {
    icon: <ShareIcon fontSize="large" />,
    title: "Public Pairings Links",
    desc: "Share a link so players can check their next match on their phone — no account or login required.",
  },
  {
    icon: <GroupsIcon fontSize="large" />,
    title: "Workspaces & Team Roles",
    desc: "Run multiple events under one workspace. Add judges, admins, and staff with role-based access control.",
  },
  {
    icon: <AccessTimeIcon fontSize="large" />,
    title: "Round Timers",
    desc: "Built-in countdown timers for each round. Pause, resume, and keep your event on schedule with ease.",
  },
  {
    icon: <EmojiEventsIcon fontSize="large" />,
    title: "Player Profiles & History",
    desc: "Players can claim their entries to track their results across events, all in one place.",
  },
];

const steps = [
  {
    n: "1",
    title: "Create a tournament",
    desc: "Name it, pick Swiss or single-elimination, set the number of rounds, and add a round timer if you need one.",
    img: "/screenshots/setup.png",
    imgAlt: "Tournament setup screen",
  },
  {
    n: "2",
    title: "Add your players",
    desc: "Type names one by one, bulk paste a list, or pick from players in your workspace. Start whenever you're ready.",
    img: "/screenshots/setup.png",
    imgAlt: "Player management",
  },
  {
    n: "3",
    title: "Run your rounds",
    desc: "Enter results after each round. Pairings and standings update instantly. When it's over, share the final standings.",
    img: "/screenshots/matches.png",
    imgAlt: "Match results view",
  },
];

export default function Landing() {
  const { mode, toggleTheme } = useThemeMode();

  return (
    <Box sx={{ bgcolor: "background.default", minHeight: "100vh", color: "text.primary" }}>

      {/* ── Nav ─────────────────────────────────────────── */}
      <Box
        component="nav"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backdropFilter: "blur(12px)",
          bgcolor: "rgba(6,14,29,0.88)",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ py: 1.5 }}
          >
            <Typography
              variant="h6"
              sx={{ fontWeight: 900, letterSpacing: "-0.02em", color: "white", fontSize: "1.2rem" }}
            >
              Matchamp
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                component={Link}
                to="/whats-new"
                sx={{
                  color: TEXT_MUTED,
                  textTransform: "none",
                  fontWeight: 500,
                  "&:hover": { color: "white", bgcolor: "transparent" },
                }}
              >
                What&apos;s New
              </Button>
              <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                <IconButton
                  onClick={toggleTheme}
                  size="small"
                  sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                >
                  {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Button
                component={Link}
                to="/login"
                sx={{
                  color: TEXT_MUTED,
                  textTransform: "none",
                  fontWeight: 500,
                  "&:hover": { color: "white", bgcolor: "transparent" },
                }}
              >
                Log in
              </Button>
              <Button
                component={Link}
                to="/register"
                variant="contained"
                sx={{
                  bgcolor: ACCENT,
                  "&:hover": { bgcolor: "#b8003f" },
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: "8px",
                  px: 2.5,
                  py: 0.75,
                }}
              >
                Sign up
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* ── Hero ────────────────────────────────────────── */}
      <Box
        sx={{
          background: `linear-gradient(160deg, #060e1d 0%, #0d2044 50%, #060e1d 100%)`,
          pt: { xs: 8, md: 12 },
          pb: { xs: 4, md: 6 },
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow blob */}
        <Box
          sx={{
            position: "absolute",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 700,
            height: 350,
            bgcolor: ACCENT,
            opacity: 0.05,
            borderRadius: "50%",
            filter: "blur(90px)",
            pointerEvents: "none",
          }}
        />

        <Container maxWidth="md" sx={{ position: "relative" }}>
          <Chip
            label="Swiss · Single Elimination · Live Standings"
            size="small"
            sx={{
              mb: 3,
              bgcolor: "rgba(220,0,78,0.1)",
              color: "#ff7aaa",
              border: "1px solid rgba(220,0,78,0.25)",
              fontWeight: 500,
              fontSize: "0.8rem",
            }}
          />

          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "2.4rem", sm: "3.2rem", md: "4.5rem" },
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              mb: 3,
            }}
          >
            Run better tournaments.
            <br />
            <Box component="span" sx={{ color: ACCENT }}>
              In minutes.
            </Box>
          </Typography>

          <Typography
            sx={{
              fontSize: { xs: "1rem", md: "1.15rem" },
              color: TEXT_MUTED,
              maxWidth: 540,
              mx: "auto",
              mb: 5,
              lineHeight: 1.75,
            }}
          >
            Matchamp handles Swiss pairings, live standings, tiebreakers, and
            player management — so you can focus on the game, not the admin.
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            alignItems="center"
            mb={8}
          >
            <Button
              component={Link}
              to="/register"
              variant="contained"
              size="large"
              sx={{
                bgcolor: ACCENT,
                "&:hover": { bgcolor: "#b8003f" },
                textTransform: "none",
                fontWeight: 700,
                fontSize: "1rem",
                borderRadius: "10px",
                px: 4,
                py: 1.5,
                boxShadow: "0 0 30px rgba(220,0,78,0.3)",
              }}
            >
              Get started
            </Button>
            <Button
              component={Link}
              to="/login"
              size="large"
              sx={{
                color: TEXT_MUTED,
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.95rem",
                "&:hover": { color: "white", bgcolor: "transparent" },
              }}
            >
              Already have an account? Log in →
            </Button>
          </Stack>

          {/* Hero screenshot */}
          <ScreenshotFrame
            src="/screenshots/matches.png"
            alt="Matchamp match tracking view"
            sx={{ maxWidth: 900, mx: "auto" }}
          />
        </Container>
      </Box>

      {/* ── Trust strip ─────────────────────────────────── */}
      <Box sx={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, py: 2.5 }}>
        <Container maxWidth="lg">
          <Stack
            direction="row"
            justifyContent="center"
            flexWrap="wrap"
            sx={{ gap: { xs: 2.5, md: 4 } }}
          >
            {[
              "Swiss pairings",
              "Single elimination",
              "Live standings",
              "Public share links",
              "Round timers",
              "Team workspaces",
            ].map((label) => (
              <Stack key={label} direction="row" spacing={0.75} alignItems="center">
                <CheckIcon sx={{ fontSize: 15, color: ACCENT }} />
                <Typography sx={{ fontSize: "0.82rem", color: TEXT_MUTED, whiteSpace: "nowrap" }}>
                  {label}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ── Features ─────────────────────────────────────── */}
      <Box sx={{ py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 7 }}>
            <Typography
              component="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                letterSpacing: "-0.02em",
                mb: 1.5,
              }}
            >
              Everything you need. Nothing you don&apos;t.
            </Typography>
            <Typography sx={{ color: TEXT_MUTED, fontSize: "1rem" }}>
              Built for organisers who want to run great events without the overhead.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {features.map((f) => (
              <Grid item xs={12} sm={6} md={4} key={f.title}>
                <Box
                  sx={{
                    bgcolor: CARD_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: "16px",
                    p: 3.5,
                    height: "100%",
                    transition: "border-color 0.2s, background 0.2s",
                    "&:hover": {
                      borderColor: "rgba(220,0,78,0.35)",
                      bgcolor: "rgba(220,0,78,0.03)",
                    },
                  }}
                >
                  <Box sx={{ color: ACCENT, mb: 2 }}>{f.icon}</Box>
                  <Typography sx={{ fontWeight: 700, mb: 1, fontSize: "1rem" }}>
                    {f.title}
                  </Typography>
                  <Typography sx={{ color: TEXT_MUTED, lineHeight: 1.7, fontSize: "0.9rem" }}>
                    {f.desc}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── How it works ─────────────────────────────────── */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: "rgba(255,255,255,0.015)",
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 8 }}>
            <Typography
              component="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                letterSpacing: "-0.02em",
                mb: 1.5,
              }}
            >
              Up and running in three steps
            </Typography>
            <Typography sx={{ color: TEXT_MUTED, fontSize: "1rem" }}>
              No setup fee. No configuration wizard. Just a tournament.
            </Typography>
          </Box>

          <Stack spacing={{ xs: 8, md: 12 }}>
            {steps.map((step, i) => (
              <Grid
                container
                key={step.n}
                spacing={{ xs: 4, md: 8 }}
                alignItems="center"
                sx={{ flexDirection: { xs: "column", md: i % 2 === 0 ? "row" : "row-reverse" } }}
              >
                <Grid item xs={12} md={5}>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: "10px",
                        bgcolor: "rgba(220,0,78,0.12)",
                        border: "1px solid rgba(220,0,78,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: ACCENT,
                        fontWeight: 900,
                        fontSize: "1rem",
                        flexShrink: 0,
                      }}
                    >
                      {step.n}
                    </Box>
                    <Box>
                      <Typography
                        sx={{ fontWeight: 700, mb: 1.5, fontSize: { xs: "1.2rem", md: "1.4rem" } }}
                      >
                        {step.title}
                      </Typography>
                      <Typography sx={{ color: TEXT_MUTED, lineHeight: 1.75, fontSize: "0.95rem" }}>
                        {step.desc}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={7}>
                  <ScreenshotFrame src={step.img} alt={step.imgAlt} />
                </Grid>
              </Grid>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ── Standings showcase ───────────────────────────── */}
      <Box sx={{ py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">
            <Grid item xs={12} md={5}>
              <Typography
                component="h2"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.8rem", md: "2.4rem" },
                  letterSpacing: "-0.02em",
                  mb: 2,
                }}
              >
                Standings that{" "}
                <Box component="span" sx={{ color: ACCENT }}>
                  just work
                </Box>
              </Typography>
              <Typography sx={{ color: TEXT_MUTED, lineHeight: 1.8, mb: 3.5, fontSize: "0.95rem" }}>
                Opponent match win percentage and tiebreakers are calculated
                automatically every time a result is entered. No spreadsheets.
                No arguments. Just the right answer.
              </Typography>
              <Stack spacing={1.5}>
                {[
                  "Real-time tiebreaker calculation (OMW%, OOMW%)",
                  "Gold, silver, bronze trophies for top 3",
                  "Two-column layout handles large player counts",
                  "Final standings shareable via public link",
                ].map((item) => (
                  <Stack key={item} direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckIcon sx={{ color: ACCENT, fontSize: 17, mt: 0.2, flexShrink: 0 }} />
                    <Typography sx={{ color: TEXT_MUTED, fontSize: "0.9rem", lineHeight: 1.6 }}>
                      {item}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={7}>
              <ScreenshotFrame
                src="/screenshots/standings.png"
                alt="Final standings with tiebreakers"
              />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── Who it's for ─────────────────────────────────── */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: "rgba(255,255,255,0.015)",
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 7 }}>
            <Typography
              component="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "1.8rem", md: "2.4rem" },
                letterSpacing: "-0.02em",
                mb: 1.5,
              }}
            >
              Built for every level of competition
            </Typography>
            <Typography sx={{ color: TEXT_MUTED, fontSize: "1rem" }}>
              Whether it&apos;s six friends or sixty competitors, Matchamp scales with you.
            </Typography>
          </Box>

          <Grid container spacing={4}>
            {[
              {
                emoji: "🎲",
                title: "Friends & casual groups",
                subtitle: "Quick setup, zero hassle",
                items: [
                  "Tournament running in under a minute",
                  "Works for card games, board games, anything competitive",
                  "No tech knowledge required",
                  "Works for any competitive format",
                ],
              },
              {
                emoji: "🏆",
                title: "Game stores & competitive events",
                subtitle: "Professional tools, simple interface",
                items: [
                  "Workspace teams for judges and staff",
                  "Public pairings link — players check their own match",
                  "Round timers for timed competitive play",
                  "Clean final standings page to share at end of event",
                ],
              },
            ].map((card) => (
              <Grid item xs={12} md={6} key={card.title}>
                <Box
                  sx={{
                    bgcolor: CARD_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: "16px",
                    p: { xs: 3, md: 4 },
                    height: "100%",
                  }}
                >
                  <Typography sx={{ fontSize: "2.2rem", mb: 1.5, lineHeight: 1 }}>
                    {card.emoji}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", mb: 0.5 }}>
                    {card.title}
                  </Typography>
                  <Typography sx={{ color: ACCENT, fontSize: "0.85rem", fontWeight: 500, mb: 3 }}>
                    {card.subtitle}
                  </Typography>
                  <Stack spacing={1.5}>
                    {card.items.map((item) => (
                      <Stack key={item} direction="row" spacing={1.5} alignItems="flex-start">
                        <CheckIcon sx={{ color: ACCENT, fontSize: 17, mt: 0.2, flexShrink: 0 }} />
                        <Typography sx={{ color: TEXT_MUTED, fontSize: "0.9rem", lineHeight: 1.65 }}>
                          {item}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Final CTA ───────────────────────────────────── */}
      <Box
        sx={{
          py: { xs: 10, md: 16 },
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            bottom: "0%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 300,
            bgcolor: ACCENT,
            opacity: 0.05,
            borderRadius: "50%",
            filter: "blur(80px)",
            pointerEvents: "none",
          }}
        />
        <Container maxWidth="sm" sx={{ position: "relative" }}>
          <Typography
            component="h2"
            sx={{
              fontWeight: 900,
              fontSize: { xs: "2rem", md: "3rem" },
              letterSpacing: "-0.03em",
              mb: 2,
              lineHeight: 1.1,
            }}
          >
            Ready to run your first tournament?
          </Typography>
          <Typography sx={{ color: TEXT_MUTED, mb: 5, fontSize: "1.05rem", lineHeight: 1.7 }}>
            Sign up and run your first tournament in minutes.
          </Typography>
          <Button
            component={Link}
            to="/register"
            variant="contained"
            size="large"
            sx={{
              bgcolor: ACCENT,
              "&:hover": { bgcolor: "#b8003f" },
              textTransform: "none",
              fontWeight: 700,
              fontSize: "1.05rem",
              borderRadius: "12px",
              px: 5,
              py: 1.75,
              boxShadow: "0 0 40px rgba(220,0,78,0.3)",
            }}
          >
            Create your account
          </Button>
        </Container>
      </Box>

      {/* ── Footer ──────────────────────────────────────── */}
      <Box sx={{ borderTop: `1px solid ${BORDER}`, py: 3, textAlign: "center" }}>
        <Typography sx={{ color: "rgba(255,255,255,0.25)", fontSize: "0.82rem" }}>
          © {new Date().getFullYear()} Matchamp · Made for tournament organisers everywhere
        </Typography>
      </Box>

    </Box>
  );
}
