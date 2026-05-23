import { defineConfig } from "vitest/config";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The whole config is cast to `any` to bypass the cross-vite type
// mismatch (Vitest 3 ships its own UserConfig that does not structurally
// match the Vite 5 UserConfig @vitejs/plugin-react@4 references). Runtime
// behaviour is unaffected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default defineConfig({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
