import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
  LinearProgress,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { register, user } = useAuth();

  // If we came from an invite (or any other page), go back there after login.
  // Otherwise fall through to the normal welcome/onboarding flow.
  const from = (location.state as { from?: Location } | null)?.from;
  const afterAuthPath = from
    ? `${from.pathname}${from.search}${from.hash}`
    : "/welcome";

  // Redirect if user becomes logged in
  useEffect(() => {
    if (user && success) {
      const timer = setTimeout(() => {
        navigate(afterAuthPath);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, success, navigate, afterAuthPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const { session } = await register(name, email, password);
      setLoading(false);
      if (session) {
        // User is logged in immediately (auto-confirm enabled). Only set success;
        // the useEffect will handle the single redirect when user updates.
        setSuccess("Registration successful! Setting up your account…");
      } else {
        // Email confirmation required
        setSuccess(
          "Registration successful! Please check your email to confirm your account, then log in.",
        );
        setTimeout(() => navigate("/login", { state: { from } }), 3000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  };

  return (
    <Box maxWidth={400} mx="auto" mt={8}>
      <Typography variant="h4" gutterBottom>
        Register
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: user ? 0 : 2 }}>
          {success}
        </Alert>
      )}
      {success && user && <LinearProgress sx={{ mb: 2 }} />}
      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            fullWidth
            error={confirmPassword.length > 0 && password !== confirmPassword}
            helperText={
              confirmPassword.length > 0 && password !== confirmPassword
                ? "Passwords do not match"
                : undefined
            }
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            fullWidth
          >
            {loading ? "Registering..." : "Register"}
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default Register;
