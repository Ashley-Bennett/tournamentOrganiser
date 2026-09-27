import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    // Don't ship source maps publicly; enable locally when debugging a build.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Libraries change far less often than app code. Keeping them in their
        // own chunks means a deploy that only touches app code leaves them
        // cached in players' browsers. Everything else is split by route.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "react";
          }
          if (/[\\/]node_modules[\\/](@mui|@emotion)[\\/]/.test(id)) return "mui";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "supabase";
          return undefined;
        },
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
});
