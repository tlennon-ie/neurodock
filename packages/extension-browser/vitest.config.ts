import { defineConfig } from "vitest/config";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  // Cast to bypass cross-vite type mismatch (Vitest 2 pins Vite 5; @vitejs/plugin-react@4 ships Vite 6 types).
  // Behaviour at runtime is unaffected.
  plugins: [react()] as unknown as never,
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "~": resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
  },
});
