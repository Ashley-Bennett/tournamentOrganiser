import { Box, CircularProgress } from "@mui/material";

interface PageLoadingProps {
  minHeight?: number | string;
}

const PageLoading: React.FC<PageLoadingProps> = ({ minHeight = "400px" }) => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight={minHeight}
  >
    <CircularProgress />
  </Box>
);

export default PageLoading;
