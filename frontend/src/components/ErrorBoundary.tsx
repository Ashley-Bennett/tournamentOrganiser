import React from "react";
import { Alert, Box, Button } from "@mui/material";

interface Props {
  children: React.ReactNode;
  section?: string;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[ErrorBoundary]",
      this.props.section ?? "app",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      const where = this.props.section ? `the ${this.props.section}` : "this page";
      return (
        <Box sx={{ p: 2 }}>
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => this.setState({ error: null })}
              >
                Try again
              </Button>
            }
          >
            Something went wrong in {where}.
          </Alert>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
