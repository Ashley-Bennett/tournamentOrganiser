import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives tests a browser-like DOM environment (needed for React component tests)
    environment: "jsdom",
    // Global setup run before each test file
    setupFiles: ["./src/test-setup.ts"],
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
