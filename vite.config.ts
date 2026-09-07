import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Copy dist/index.html -> dist/404.html after every build so that GitHub Pages
 * (a static file host with no SPA rewrite rules) serves the app itself for
 * deep links and page refreshes instead of a blank Pages 404 page.
 */
function spa404Fallback(): Plugin {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const indexFile = path.join(outDir, "index.html");
      const notFoundFile = path.join(outDir, "404.html");
      try {
        if (fs.existsSync(indexFile)) {
          fs.copyFileSync(indexFile, notFoundFile);
        }
      } catch (err) {
        console.warn("[spa-404-fallback] could not write 404.html:", err);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Repository deployment: https://<user>.github.io/zheno-website/
  base: "/zheno-website/",
  plugins: [react(), tailwindcss(), viteSingleFile(), spa404Fallback()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
