import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
    // PWA plugin temporarily disabled due to Terser compatibility issues
    // To re-enable: install esbuild and update vite-plugin-pwa to compatible version
  ],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,

    // ✨ Minification (disabled temporarily)
    // minify: "esbuild",

    // ✨ Code splitting
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'vendor';
          }
          if (id.includes('supabase')) {
            return 'supabase';
          }
          if (id.includes('axios')) {
            return 'utils';
          }
        },
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
      },
    },

    // ✨ Asset optimization
    assetsInlineLimit: 4096,

    // ✨ CSS optimization
    cssCodeSplit: true,

    // ✨ Browser target
    target: "es2015",

    chunkSizeWarningLimit: 1000,
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
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")).version),
  },
});
