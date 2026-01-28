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
import { useAuth } from "../AuthContext";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register, user } = useAuth();

  // Redirect if user becomes logged in
  useEffect(() => {
    if (user && success) {
      // User was logged in after registration, redirect to dashboard
      const timer = setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, success, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const { session } = await register(name, email, password);
      setLoading(false);
      if (session) {
        // User is logged in immediately (auto-confirm enabled)
        setSuccess("Registration successful! Redirecting to dashboard...");
        // Redirect directly since we have a session
        setTimeout(() => {
          navigate("/dashboard");
        }, 1500);
      } else {
        // Email confirmation required
        setSuccess(
          "Registration successful! Please check your email to confirm your account, then log in.",
        );
        setTimeout(() => navigate("/login"), 3000);
      }
    } catch (err: any) {
      setError(err.message);
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
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
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
