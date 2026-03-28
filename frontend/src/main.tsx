import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppThemeProvider } from "./ThemeContext";
import App from "./App.tsx";
import { AuthProvider } from "./AuthContext";

const router = createBrowserRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppThemeProvider>
  </React.StrictMode>
);
