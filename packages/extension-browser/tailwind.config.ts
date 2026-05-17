import type { Config } from "tailwindcss";

/**
 * NeuroDock visual language per plan.md §2:
 * - Atkinson Hyperlegible body, Lexend headings, JetBrains Mono code.
 * - Single neutral hue. Calm light + dim dark. No animation by default.
 * - Generous line-height (>= 1.65). No gradients, no decorative flourishes.
 *
 * We use system-font fallbacks because the extension MUST be air-gappable;
 * loading webfonts from a CDN would violate local-first defaults.
 */
const config: Config = {
  content: [
    "./entrypoints/**/*.{ts,tsx,html}",
    "./src/**/*.{ts,tsx}",
  ],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        body: [
          "Atkinson Hyperlegible",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        heading: [
          "Lexend",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Single neutral hue per plan.md §2. Calm light + dim dark.
        neutral: {
          50: "#fafaf9",
          100: "#f4f4f2",
          200: "#e6e6e3",
          300: "#cfcfcb",
          400: "#a8a8a3",
          500: "#7a7a76",
          600: "#56564f",
          700: "#3d3d39",
          800: "#262625",
          900: "#161615",
          950: "#0c0c0b",
        },
        accent: {
          // Used sparingly for focus rings + banner. No gradients.
          light: "#4a4a47",
          dark: "#cfcfcb",
        },
        // Persistent cloud-mode banner — must be visible but not alarming.
        // Plan.md §2 forbids alarming reds; we use a desaturated amber.
        warn: {
          light: "#7c5b1a",
          dark: "#d6b06b",
        },
      },
      lineHeight: {
        // plan.md §2: >= 1.65
        nd: "1.65",
      },
      // No keyframes; reduced-motion is the default in the popup.
      animation: {},
      keyframes: {},
    },
  },
  plugins: [],
};

export default config;
