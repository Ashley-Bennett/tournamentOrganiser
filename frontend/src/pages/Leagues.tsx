import React, { useState, useEffect } from "react";
import {
  Typography,
  Button,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { apiCall, handleApiError } from "../utils/api";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import PageLoading from "../components/PageLoading";
import { formatDate } from "../utils/format";

interface League {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

const Leagues: React.FC = () => {
  const handleUnauthorized = useAuthRedirect();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLeagues();
  }, []);

  const fetchLeagues = async () => {
    try {
      setLoading(true);
      const response = await apiCall("/api/leagues");
      if (response.ok) {
        const data = await response.json();
        setLeagues(data);
      } else {
        if (handleUnauthorized(response)) return;
        await handleApiError(response);
      }
    } catch (error: any) {
      setError(error.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await apiCall("/api/leagues", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await response.json();
        setOpenDialog(false);
        setFormData({ name: "", description: "" });
        fetchLeagues(); // Refresh the list
      } else {
        if (handleUnauthorized(response)) return;
        await handleApiError(response);
      }
    } catch (error: any) {
      setError(error.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData({
        ...formData,
        [field]: event.target.value,
      });
    };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4" component="h1">
          Leagues
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Add League
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leagues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No leagues found. Add your first league!
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                leagues.map((league) => (
                  <TableRow key={league.id}>
                    <TableCell>{league.name}</TableCell>
                    <TableCell>
                      {league.description || "No description"}
                    </TableCell>
                    <TableCell>{formatDate(league.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add League Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New League</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="League Name"
              value={formData.name}
              onChange={handleChange("name")}
              required
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description (Optional)"
              value={formData.description}
              onChange={handleChange("description")}
              multiline
              rows={3}
              variant="outlined"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Adding..." : "Add League"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default Leagues;
