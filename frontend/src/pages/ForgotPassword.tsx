import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
  Link,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "../supabaseClient";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <Box maxWidth={400} mx="auto" mt={8}>
      <Typography variant="h4" gutterBottom>
        Reset password
      </Typography>

      {sent ? (
        <Alert severity="success">
          Check your email for a password reset link. You can close this page.
        </Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Enter your email address and we'll send you a link to reset your password.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoFocus
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={loading}
                fullWidth
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </Stack>
          </form>
        </>
      )}

      <Box mt={3} textAlign="center">
        <Link component={RouterLink} to="/login" variant="body2">
          Back to login
        </Link>
      </Box>
    </Box>
  );
};

export default ForgotPassword;
