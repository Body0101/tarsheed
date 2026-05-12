import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8")
);

// For GitHub Pages deployment with /tarsheed/ subdirectory
const basePath = process.env.VITE_BASE_PATH || "/tarsheed/";
const enableBundleReport = process.env.VITE_ANALYZE === "true";

export default defineConfig({
  plugins: [
    react(),

    // Progressive Web App
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),

    // Bundle analyzer
    ...(enableBundleReport
      ? [
          visualizer({
            open: false,
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],

  // Base path for GitHub Pages deployment
  base: basePath,

  build: {
    outDir: "dist",
    sourcemap: true,

    // Minification
    minify: "esbuild",

    // Asset optimization
    assetsInlineLimit: 4096,

    // CSS optimization
    cssCodeSplit: true,

    // Browser target
    target: "es2015",

    chunkSizeWarningLimit: 1000,

    // Code splitting
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router-dom")
          ) {
            return "vendor";
          }

          if (id.includes("supabase")) {
            return "supabase";
          }

          if (id.includes("axios")) {
            return "utils";
          }
        },

        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
      },
    },
  },

  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 4173,
    host: true,
  },

  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
});