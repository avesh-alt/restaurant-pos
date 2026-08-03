import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Electron loads the app from http://127.0.0.1:4001 (local proxy),
  // so we use '/' base (same as a normal web server).
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
