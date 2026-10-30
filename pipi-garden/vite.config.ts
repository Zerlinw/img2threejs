import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    watch: {
      ignored: ["**/*.tmpdir/**", "**/.*.tmpdir/**"],
    },
  },
  build: {
    outDir: "../dist-pipi-garden",
    emptyOutDir: true,
    target: "es2020",
  },
});
