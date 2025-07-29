import { Box, Typography, Button, Stack } from "@mui/material";
import { Link } from "react-router-dom";

const Landing = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    minHeight="60vh"
  >
    <Typography variant="h2" gutterBottom>
      Welcome to Matchamp
    </Typography>
    <Typography variant="h5" color="text.secondary" gutterBottom>
      Organise and manage your tournaments with ease.
    </Typography>
    <Stack direction="row" spacing={2} mt={4}>
      <Button variant="contained" color="primary" component={Link} to="/login">
        Login
      </Button>
      <Button
        variant="outlined"
        color="primary"
        component={Link}
        to="/register"
      >
        Register
      </Button>
    </Stack>
  </Box>
);

export default Landing;
