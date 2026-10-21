import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the production build can be loaded by Electron via file://.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
