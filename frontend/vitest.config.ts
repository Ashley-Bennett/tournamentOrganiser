import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives tests a browser-like DOM environment (needed for React component tests)
    environment: "jsdom",
    // Global setup run before each test file
    setupFiles: ["./src/test-setup.ts"],
    // The default 5s is tight for this suite: the page-level tests render MUI
    // trees and drive them with userEvent, and they run in parallel. At ~540
    // tests several were timing out under load on a fast machine while passing
    // in isolation — CI's two-core runners have less headroom still. The slow
    // ones take about 1.5s each when unloaded, so this is margin, not a mask.
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Exclude bootstrapping files that have no testable logic
      exclude: [
        "src/main.tsx",
        "src/supabaseClient.ts",
        "src/vite-env.d.ts",
        "src/test-setup.ts",
      ],
    },
  },
});
