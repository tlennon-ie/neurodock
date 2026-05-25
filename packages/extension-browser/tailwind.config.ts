import type { Config } from "tailwindcss";

/**
 * NeuroDock visual language — mirrors docs/src/styles/tokens.css.
 *
 * All colour, type, and motion values come from CSS custom properties
 * declared in `src/styles/tokens.css`. Tailwind utility classes resolve
 * to `var(--nd-color-…)` so the popup, the tab view, and any injected
 * panel all read the same tokens, and dark mode flips via media-query
 * inside the tokens file (no `dark:` class needed for colour roles).
 *
 * Design contract:
 *   - Single neutral accent (desaturated slate-blue, hue 250).
 *   - Calm light + dim dark. No gradients.
 *   - Atkinson Hyperlegible body, Lexend headings, JetBrains Mono code.
 *   - Generous line-height (>= 1.65). Motion disabled by default.
 *   - Hairlines, not shadows. No decorative depth.
 *
 * Legacy keys (`accent.light`, `warn.light`, `neutral.*`) are kept as
 * aliases over the same tokens so existing call sites and tests do not
 * regress while components migrate to the semantic names below. New
 * code should prefer the semantic keys (`bg`, `fg`, `hairline`, …).
 */
const config: Config = {
  content: ["./entrypoints/**/*.{ts,tsx,html}", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        body: ["var(--nd-font-body)"],
        heading: ["var(--nd-font-heading)"],
        mono: ["var(--nd-font-mono)"],
      },
      fontSize: {
        // Match docs scale so headings line up across surfaces.
        "nd-sm": ["0.9375rem", { lineHeight: "1.5" }],
        "nd-base": ["1rem", { lineHeight: "1.65" }],
        "nd-lg": ["1.125rem", { lineHeight: "1.5" }],
        "nd-xl": ["1.375rem", { lineHeight: "1.25" }],
        "nd-2xl": ["1.75rem", { lineHeight: "1.25" }],
        "nd-3xl": ["2.125rem", { lineHeight: "1.25" }],
      },
      colors: {
        // Semantic, token-backed roles. Prefer these everywhere.
        bg: "var(--nd-color-bg)",
        "bg-nav": "var(--nd-color-bg-nav)",
        "bg-sidebar": "var(--nd-color-bg-sidebar)",
        "bg-code": "var(--nd-color-bg-inline-code)",
        fg: "var(--nd-color-fg)",
        "fg-accent": "var(--nd-color-fg-accent)",
        "fg-muted": "var(--nd-color-fg-muted)",
        "fg-invert": "var(--nd-color-fg-invert)",
        hairline: "var(--nd-color-hairline)",
        "hairline-light": "var(--nd-color-hairline-light)",
        shade: "var(--nd-color-shade)",
        // Single neutral accent + low/high variants (low for backgrounds,
        // high for hover / pressed text contrast).
        accent: {
          DEFAULT: "var(--nd-color-accent)",
          low: "var(--nd-color-accent-low)",
          high: "var(--nd-color-accent-high)",
          // Legacy keys (consumed by older components + cloud-mode-banner
          // tests). Resolve to the same token so visual identity stays
          // consistent during the migration.
          light: "var(--nd-color-accent)",
          dark: "var(--nd-color-accent-high)",
        },
        // Calm, never alarming. Used by the persistent cloud-mode banner
        // and any fallback notices.
        warn: {
          DEFAULT: "var(--nd-color-warn-fg)",
          fg: "var(--nd-color-warn-fg)",
          border: "var(--nd-color-warn-border)",
          bg: "var(--nd-color-warn-bg)",
          // Legacy aliases (cloud-mode-banner unit test consults the
          // `warn-light` / `warn-dark` keys directly).
          light: "var(--nd-color-warn-fg)",
          dark: "var(--nd-color-warn-fg)",
        },
        error: {
          DEFAULT: "var(--nd-color-error-fg)",
          fg: "var(--nd-color-error-fg)",
          border: "var(--nd-color-error-border)",
          bg: "var(--nd-color-error-bg)",
        },
        // Legacy `neutral.*` scale used by the pre-refresh components.
        // Each step resolves to a token role so the visual identity
        // stays consistent during migration. After all surfaces move to
        // the semantic names above, this block can be deleted.
        neutral: {
          50: "var(--nd-color-bg)",
          100: "var(--nd-color-bg-nav)",
          200: "var(--nd-color-hairline)",
          300: "var(--nd-color-hairline)",
          400: "var(--nd-color-shade)",
          500: "var(--nd-color-fg-muted)",
          600: "var(--nd-color-fg-muted)",
          700: "var(--nd-color-fg-accent)",
          800: "var(--nd-color-fg)",
          900: "var(--nd-color-fg)",
          950: "var(--nd-color-bg)",
        },
        // Legacy `success`. The cloud-mode-banner test reads it; we map
        // it to the calm accent so nothing alarming creeps in.
        success: {
          light: "var(--nd-color-accent-high)",
          dark: "var(--nd-color-accent-high)",
        },
      },
      lineHeight: {
        nd: "1.65",
        "nd-heading": "1.25",
      },
      transitionDuration: {
        nd: "var(--nd-transition-duration)",
      },
      // No keyframes; reduced-motion is the default. The opt-in 120ms
      // slot is exposed via --nd-transition-duration for components that
      // need a hover/focus transition under no-preference media.
      animation: {},
      keyframes: {},
    },
  },
  plugins: [],
};

export default config;
