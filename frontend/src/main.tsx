import "@fontsource/roboto/300.css";
if (import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "true") {
  import("./devTools").then(({ installDevTools }) => installDevTools());
}
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppThemeProvider } from "./ThemeContext";
import App from "./App.tsx";
import { AuthProvider } from "./AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

const router = createBrowserRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
