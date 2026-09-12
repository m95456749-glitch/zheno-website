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
  // Root deployment: the custom domain https://zheno.devs.surf/ serves
  // the site from "/". (The router + asset URLs detect the legacy
  // /zheno-website/ repository sub-path at runtime, so one build
  // works on both mounts — see src/utils/siteBase.ts.)
  base: "/",
  build: {
    // White-screen guard: Vite 7's default target
    // (baseline-widely-available) leaves ES2022 syntax in the inline
    // bundle (class static blocks, #private fields). Browsers older
    // than ~Chrome 94 / Safari 16.2 / Firefox 93 reject the whole
    // module script with a SyntaxError, so the app never boots and the
    // visitor sees a blank white page. es2019 lowers that syntax so the
    // app boots on ~2019-era browsers; the index.html boot watchdog
    // covers any remaining boot failure with a reload card instead of
    // a blank page.
    target: "es2019",
  },
  plugins: [
    react(),
    tailwindcss(),
    // Pin the base back to "/" after vite-plugin-singlefile's
    // recommended build config (it would otherwise override `base`
    // with "./", breaking root-absolute asset URLs).
    viteSingleFile({
      overrideConfig: {
        base: "/",
      },
    }),
    spa404Fallback(),
  ],
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
