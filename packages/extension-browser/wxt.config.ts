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
 * ─────────────────────────────────────────────────────────────────────
 * v0.0.4 SECURITY MODEL — non-localhost local providers
 * ─────────────────────────────────────────────────────────────────────
 *
 * Some users cannot bind LM Studio / Ollama to localhost. Windows in
 * particular sometimes binds dev servers to APIPA / link-local IPs
 * (169.254.x.x), and others want to point at a Tailscale node or LAN
 * box. We support this WITHOUT degrading to `<all_urls>` by widening
 * the CSP `connect-src` with **port-restricted host wildcards**:
 *
 *   - http://*:1234   (LM Studio default port)
 *   - http://*:11434  (Ollama default port)
 *
 * This is strictly safer than `<all_urls>`:
 *   - the port is fixed to the well-known dev-server ports for the two
 *     local LLM stacks we support;
 *   - http only (not https) — TLS local hosts (Tailscale magic-DNS,
 *     reverse proxies) would need a separate `https://*:port` entry
 *     and are intentionally not included in v0.0.4;
 *   - the extension still needs an explicit per-host permission grant
 *     via `chrome.permissions.request()` before any fetch can succeed
 *     (see `src/lib/permissions.ts`). The CSP merely declares that the
 *     port is on the allow-list at the platform layer; the host-permission
 *     check is the actual gate the user controls.
 *
 * Chrome Web Store accepts port-restricted host wildcards. This is the
 * canonical pattern used by LocalForage-style developer-tools extensions
 * that need to reach an arbitrary local dev server.
 *
 * `optional_host_permissions` is widened to `http://*\/*` for the
 * NON-localhost case ONLY. The default-granted permissions in
 * `host_permissions` remain the supported per-site origins. Non-localhost
 * hosts are granted PER-HOST AT RUNTIME via `chrome.permissions.request()`
 * after the user types a non-localhost base URL in Settings and clicks
 * Save / Test / Refresh. Chrome persists optional permissions across
 * browser restarts, and the user can revoke per-host from the Settings
 * "Host permissions" panel.
 *
 * The existing localhost / 127.0.0.1 entries are preserved so currently
 * working installs do not regress.
 *
 * v0.0.3 CSP entries are kept and extended:
 *   - http://localhost:11434 + http://127.0.0.1:11434 + http://*:11434
 *   - http://localhost:1234  + http://127.0.0.1:1234  + http://*:1234
 *   - https://api.anthropic.com
 *   - https://api.openai.com
 *   - https://openrouter.ai
 *   - https://generativelanguage.googleapis.com
 *
 * No `eval`, no inline scripts. The Anthropic and OpenAI SDKs both
 * support browser-context fetch and stream parsing without dynamic
 * code evaluation. OpenRouter and LM Studio are hit via plain `fetch`
 * (no SDK).
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
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    action: {
      default_title: "NeuroDock — Translate",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },
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
      "https://*.notion.so/*",
      "https://*.notion.site/*",
      "https://github.com/*",
      "https://docs.google.com/*",
      "https://outlook.live.com/*",
      "https://outlook.office.com/*",
      "https://outlook.office365.com/*",
    ],
    optional_host_permissions: [
      // Default localhost grants for the local LLM stacks.
      "http://localhost/*",
      "http://127.0.0.1/*",
      // v0.0.4: granted per-host at runtime via chrome.permissions.request()
      // when the user types a non-localhost base URL in Settings (e.g. an
      // APIPA address like 169.254.83.107, a Tailscale node, or a LAN box).
      // The user-typed host is whitelisted only after explicit consent;
      // the Settings UI exposes a Revoke control to remove it again.
      "http://*/*",
      // 0.0.18: also opt-in https for image translation. When the user
      // right-clicks an image on any HTTPS site we need to fetch the
      // image bytes (LM Studio + Ollama only accept base64). The
      // permission is REQUESTED at right-click time (user gesture, so
      // chrome.permissions.request can prompt) — never grabbed at install.
      "https://*/*",
      // Cloud providers — requested when the user saves an API key.
      "https://api.anthropic.com/*",
      "https://api.openai.com/*",
      "https://openrouter.ai/*",
      "https://generativelanguage.googleapis.com/*",
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; " +
        "object-src 'self'; " +
        "connect-src 'self' " +
        // Localhost variants (v0.0.3, kept for unchanged installs).
        "http://localhost:11434 " +
        "http://127.0.0.1:11434 " +
        "http://localhost:1234 " +
        "http://127.0.0.1:1234 " +
        // v0.0.4: port-restricted host wildcards for non-localhost local
        // providers (e.g. APIPA, Tailscale, LAN box). Safer than the
        // previous bare http:/https: umbrella because the port is fixed
        // to the well-known LLM dev-server ports. The user must still
        // grant the specific host via runtime chrome.permissions.request()
        // before any fetch can succeed — the CSP only lifts the
        // platform-level block; host_permissions is the actual gate.
        "http://*:11434 " +
        "http://*:1234 " +
        // Cloud-provider origins — explicit allow-list, no wildcards.
        "https://api.anthropic.com " +
        "https://api.openai.com " +
        "https://openrouter.ai " +
        "https://generativelanguage.googleapis.com " +
        // data: is required for screenshot-style image inputs and for
        // the local base64 round-trip used by describe_image.
        //
        // SECURITY NOTE (audit C1 — 2026-05-27):
        // The previous CSP carried bare `http:` and `https:` wildcards
        // so the SW could fetch image bytes from any user-granted host
        // (right-click describe on arbitrary HTTPS/HTTP images). Those
        // wildcards have been removed and replaced with explicit cloud-
        // provider origins above. KNOWN LIMITATION: the SW fetch() for
        // image bytes from non-listed HTTPS/HTTP origins will now be
        // blocked by the CSP before host_permissions can gate it. The
        // image-translation feature (describe_image on arbitrary sites)
        // is therefore degraded until a proper solution is designed —
        // either a separate per-host nonce mechanism, a proxy fetch
        // through the content-script (which runs in the page origin, not
        // the extension origin), or explicit per-provider CSP entries.
        // Do NOT re-add `http:` or `https:` here without a security
        // review — that was the C1 finding.
        "data:;",
    },
    browser_specific_settings: {
      gecko: {
        id: "neurodock-extension@neurodock.org",
        strict_min_version: "115.0",
        // AMO validation requirement (hard error since late 2025): every
        // extension must declare what data it collects. NeuroDock's honest
        // answer is "none" — the developer collects and receives nothing.
        // Selected text is only ever sent to endpoints the USER configures:
        // localhost (LM Studio / Ollama) by default, or a cloud provider the
        // user explicitly opts into with their own API key. That opt-in flow
        // and its trade-offs are documented in PRIVACY.md and the AMO
        // listing's privacy section; no data ever flows to NeuroDock.
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    // Tab view (entrypoints/tab/ → tab.html). Marked web-accessible so
    // chrome.tabs.create({ url: chrome.runtime.getURL("tab.html") })
    // from the popup can open it as a regular tab. The page runs in
    // the extension origin (chrome-extension://<id>/), so this entry
    // only governs which top-level frames are allowed to navigate to
    // the page — not any new data exposure. Required by MV3.
    web_accessible_resources: [
      {
        resources: ["tab.html"],
        matches: ["<all_urls>"],
      },
      // Theme v2 — bundled webfonts must be reachable from the in-page
      // shadow-root islands so the host-page CSS does not fall back to
      // system-ui inside the panel. Listed by extension only; serving
      // them does not grant the page any new capability (woff2 is inert).
      {
        resources: ["fonts/*.woff2"],
        matches: ["<all_urls>"],
      },
    ],
  },
  vite: () => ({
    build: {
      // Security: do not ship inline sourcemaps in production bundles.
      // Inline sourcemaps embed the original TypeScript source inside
      // every .crx/.xpi file, leaking internal implementation details.
      // Use "hidden" locally if you need DevTools debugging (generates
      // separate .map files that are NOT included in the extension bundle).
      sourcemap: false,
      // Vite's default browser targets (chrome87/firefox78/es2020) are far
      // below this extension's real floor (Chrome MV3, Firefox 115 per
      // strict_min_version) and make esbuild >=0.28 refuse the build with
      // "transform not supported" errors. Target the actual minimums.
      target: ["chrome110", "firefox115", "es2022"],
    },
  }),
});
