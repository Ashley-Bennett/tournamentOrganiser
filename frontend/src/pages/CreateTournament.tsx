import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from "@mui/material";
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
} from "@mui/icons-material";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";

const CreateTournament: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    tournament_type: "single_elimination",
  });

  const handleChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement | { value: unknown }> | any) => {
      setFormData({
        ...formData,
        [field]: event.target.value,
      });
    };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!user) {
        logout();
        navigate("/login");
        return;
      }

      const { data, error: insertError } = await supabase
        .from("tournaments")
        .insert({
          name: formData.name,
          created_by: user.id,
          status: "draft",
          tournament_type: formData.tournament_type,
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(insertError.message || "Failed to create tournament");
      }

      if (data?.id) {
        navigate(`/tournaments/${data.id}`);
      } else {
        navigate("/tournaments");
      }
    } catch (error: any) {
      setError(error.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/tournaments")}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4" component="h1">
          Create Tournament
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tournament Name"
                value={formData.name}
                onChange={handleChange("name")}
                required
                variant="outlined"
              />
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Tournament Type</InputLabel>
                <Select
                  value={formData.tournament_type}
                  onChange={handleChange("tournament_type")}
                  label="Tournament Type"
                  variant="outlined"
                >
                  <MenuItem value="single_elimination">
                    Single Elimination
                  </MenuItem>
                  <MenuItem value="swiss">Swiss</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => navigate("/tournaments")}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create Tournament"}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
};

export default CreateTournament;
