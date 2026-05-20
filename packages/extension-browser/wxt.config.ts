import { defineConfig } from "wxt";

/**
 * WXT configuration for the NeuroDock browser extension.
 *
 * Targets: Chrome (default), Firefox, Edge — all Manifest V3.
 *
 * Design constraints from plan.md §7 and the agent operating manual:
 * - Per-site host_permissions only. No <all_urls>.
 * - activeTab + contextMenus for the right-click translate action.
 * - storage for extension-scoped profile + history (local IndexedDB lives
 *   beside chrome.storage.local; both are local-only).
 * - notifications for non-blocking error / status surfaces.
 * - scripting permission so the service worker can re-inject content
 *   scripts after SPA navigations in Gmail / Slack / Notion / Linear.
 * - No remote endpoints in the default host_permissions. Cloud-provider
 *   origins are requested via `optional_host_permissions` only when the
 *   user explicitly enables a cloud provider in Settings.
 *
 * v0.0.2 CSP additions: the MV3
 * `content_security_policy.extension_pages` `connect-src` allow-list
 * now includes:
 *   - http://localhost:11434 and http://127.0.0.1:11434 (Ollama)
 *   - https://api.anthropic.com
 *   - https://api.openai.com
 *   - https://openrouter.ai
 *
 * No `eval`, no inline scripts. The Anthropic and OpenAI SDKs both
 * support browser-context fetch and stream parsing without dynamic
 * code evaluation. OpenRouter is hit via plain `fetch` (no SDK).
 */
export default defineConfig({
  srcDir: ".",
  modules: ["@wxt-dev/module-react"],
  outDir: ".output",
  manifestVersion: 3,
  manifest: {
    name: "NeuroDock — Translate",
    description:
      "Decode corporate subtext and check tone before you send. Local-first by default; cloud only with your explicit consent.",
    permissions: [
      "activeTab",
      "storage",
      "contextMenus",
      "scripting",
      "notifications",
    ],
    host_permissions: [
      "https://mail.google.com/*",
      "https://app.slack.com/*",
      "https://linear.app/*",
      "https://www.notion.so/*",
      "https://github.com/*",
      "https://docs.google.com/*",
      "https://outlook.live.com/*",
      "https://outlook.office.com/*",
      "https://outlook.office365.com/*",
    ],
    optional_host_permissions: [
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://api.anthropic.com/*",
      "https://api.openai.com/*",
      "https://openrouter.ai/*",
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; " +
        "object-src 'self'; " +
        "connect-src 'self' " +
        "http://localhost:11434 " +
        "http://127.0.0.1:11434 " +
        "https://api.anthropic.com " +
        "https://api.openai.com " +
        "https://openrouter.ai;",
    },
    action: {
      default_title: "NeuroDock — Translate",
    },
    browser_specific_settings: {
      gecko: {
        id: "neurodock-extension@neurodock.org",
        strict_min_version: "115.0",
      },
    },
  },
  vite: () => ({
    build: {
      sourcemap: "inline",
    },
  }),
});
