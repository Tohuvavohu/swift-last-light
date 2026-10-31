import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE_PATH || "/",
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local", ".portal.cosmicfrontier.org"],
  },
});
