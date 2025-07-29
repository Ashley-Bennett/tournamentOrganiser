import React, { useState, useEffect } from "react";
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
import { apiCall } from "../utils/api";
import { useAuth } from "../AuthContext";

interface League {
  id: number;
  name: string;
  description?: string;
}

const CreateTournament: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    date: new Date().toISOString().split("T")[0], // Default to current date
    league_id: "",
    bracket_type: "SWISS",
  });

  useEffect(() => {
    fetchLeagues();
  }, []);

  const fetchLeagues = async () => {
    try {
      const response = await apiCall("/api/leagues");
      if (response.ok) {
        const data = await response.json();
        setLeagues(data);
      } else {
        if (response.status === 401) {
          logout();
          navigate("/login");
          return;
        }
        console.error("Failed to fetch leagues");
      }
    } catch (error) {
      console.error("Error fetching leagues:", error);
    }
  };

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
      const requestBody = {
        name: formData.name,
        date: formData.date,
        league_id: formData.league_id
          ? parseInt(formData.league_id)
          : undefined,
        bracket_type: formData.bracket_type,
        status: "new",
      };

      const response = await apiCall("/api/tournaments", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        await response.json();
        navigate("/tournaments");
      } else {
        const errorData = await response.json();
        console.error("Server error:", errorData);
        setError(errorData.error || "Failed to create tournament");
      }
    } catch (error) {
      setError("Network error. Please try again.");
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

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Tournament Date"
                type="date"
                value={formData.date}
                onChange={handleChange("date")}
                required
                InputLabelProps={{
                  shrink: true,
                }}
                variant="outlined"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>League (Optional)</InputLabel>
                <Select
                  value={formData.league_id}
                  label="League (Optional)"
                  onChange={handleChange("league_id")}
                >
                  <MenuItem value="">
                    <em>No League</em>
                  </MenuItem>
                  {leagues.map((league) => (
                    <MenuItem key={league.id} value={league.id}>
                      {league.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Bracket Type</InputLabel>
                <Select
                  value={formData.bracket_type}
                  label="Bracket Type"
                  onChange={handleChange("bracket_type")}
                  required
                >
                  <MenuItem value="SWISS">Swiss System</MenuItem>
                  <MenuItem value="SINGLE_ELIMINATION" disabled>
                    Single Elimination (Coming Soon)
                  </MenuItem>
                  <MenuItem value="DOUBLE_ELIMINATION" disabled>
                    Double Elimination (Coming Soon)
                  </MenuItem>
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
