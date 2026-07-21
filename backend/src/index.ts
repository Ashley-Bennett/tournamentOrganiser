import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Basic middleware (no database, just a simple API shell)
app.use(helmet());

const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || "https://matchamp.win",
    "https://matchamp.win",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://localhost:5173",
    "https://localhost:3000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Matchamp Backend (no database) is running",
  });
});

// Simple API info
app.get("/api", (req, res) => {
  res.json({
    message: "Matchamp API (database disabled)",
    version: "1.0.0",
  });
});

// Auth and all data live in Supabase; this service only answers health checks.

// Fallback for all other API routes: explicitly state that the database is disabled
app.all("/api/*", (req, res) => {
  res.status(501).json({
    error: "Database-backed endpoints are currently disabled in this build",
  });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({
      error: "Something went wrong!",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  },
);

// Route handling for non-API paths
if (process.env.NODE_ENV === "production") {
  // In production on Render, the frontend is served by a separate static site.
  // The backend should only handle /api routes and return 404 for everything else.
  app.use("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Route not found" });
    }
    res.status(404).json({ error: "Route not found" });
  });
} else {
  // In development, redirect non-API routes to the frontend dev server
  app.use("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      return res.redirect(`http://localhost:5173${req.path}`);
    }
    res.status(404).json({ error: "Route not found" });
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
