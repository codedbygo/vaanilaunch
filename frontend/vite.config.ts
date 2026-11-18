import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite build and dev server. Test settings live in vitest.config.ts.
// In dev, the FastAPI backend on :8000 answers the API, store previews and photos.
// Anchored regexes: a bare "/s" prefix would also capture Vite's own "/src/..." modules.
const backend = "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "^/api/": backend, "^/s/": backend, "^/media/": backend },
  },
  preview: { port: 4173, strictPort: true },
  build: {
    // No source maps in production: they would publish readable source to every visitor.
    sourcemap: false,
    // A chunk over this size is a review question, not a warning to silence.
    chunkSizeWarningLimit: 500,
    // Vendor code changes rarely: split it so an app release doesn't re-download React.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("@tanstack")) return "tanstack";
          return "vendor";
        },
      },
    },
  },
});
