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

// Pages load as separate chunks. A tab left open across a deploy still points
// at the previous build's hashed chunk names, which are gone once the new build
// is live, so the next page it opens fails to load. Reload once to pick up the
// new build. The window stops a loop if a chunk is missing for another reason,
// in which case the error reaches the page's error boundary as before.
const CHUNK_RELOAD_KEY = "mc_chunk_reload_at";
window.addEventListener("vite:preloadError", () => {
  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0;
    if (Date.now() - lastReload < 10_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked means no loop guard, so do not risk reloading forever.
    return;
  }
  window.location.reload();
});

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
