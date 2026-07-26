import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const navigate = useNavigate();

  // supabase-js processes the recovery token in the URL during client init —
  // which can happen before this page mounts, so the transient PASSWORD_RECOVERY
  // event may fire before we subscribe. INITIAL_SESSION is replayed to every new
  // subscriber after init completes, so we key off the resulting session instead:
  // a session present means the link was valid; INITIAL_SESSION with no session
  // means the token was missing, already used, or expired.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      } else if (event === "INITIAL_SESSION") {
        if (session) setReady(true);
        else setInvalid(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      navigate("/login", { replace: true, state: { passwordReset: true } });
    }
  };

  if (invalid) {
    return (
      <Box maxWidth={400} mx="auto" mt={8}>
        <Alert severity="error" sx={{ mb: 2 }}>
          This password reset link is invalid or has expired.
        </Alert>
        <Button variant="contained" onClick={() => navigate("/forgot-password")}>
          Request a new link
        </Button>
      </Box>
    );
  }

  if (!ready) {
    return (
      <Box maxWidth={400} mx="auto" mt={8}>
        <Typography variant="body1" color="text.secondary">
          Verifying reset link…
        </Typography>
      </Box>
    );
  }

  return (
    <Box maxWidth={400} mx="auto" mt={8}>
      <Typography variant="h4" gutterBottom>
        Choose a new password
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <TextField
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            autoFocus
          />
          <TextField
            label="Confirm new password"
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
            {loading ? "Saving…" : "Set new password"}
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default ResetPassword;
