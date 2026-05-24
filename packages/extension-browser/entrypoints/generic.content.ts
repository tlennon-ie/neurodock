/**
 * Generic content script — runs on ANY page that the user grants
 * permission for, programmatically injected by the SW on right-click
 * when the active tab isn't one of the nine declared per-site hosts.
 *
 * Pre-0.0.23, NeuroDock only injected per-site content scripts on
 * Gmail / Slack / Linear / Notion / GitHub / Google Docs / Outlook
 * variants. Right-clicking on LinkedIn (or any other site) ran the
 * translation in the SW correctly but had no in-page island to show
 * the result panel — so the user got a notification telling them to
 * check History, which is a dead-end for ND users in flow.
 *
 * This script is the "any page" fallback. It declares no `matches`
 * patterns (registration is `runtime`-only) so Chrome doesn't
 * auto-inject it — the SW calls `chrome.scripting.executeScript` to
 * inject it on demand into the active tab when the right-click fires
 * on a non-supported host. The script mounts the same React island
 * the per-site scripts use; channel is auto-detected from the URL.
 *
 * Why this is safe:
 *   - Chrome only allows executeScript into tabs the extension has
 *     host_permission for. The user explicitly granted that via
 *     "Enable for every site" or per-host right-click prompt.
 *   - The script is idempotent — bootstrapContent's `mountIsland`
 *     detects an already-mounted island and reuses it, so a second
 *     injection on the same tab does not duplicate the React tree.
 *   - No site-specific selectors run. The selection-watcher uses
 *     generic DOM heuristics that work on any contenteditable + form
 *     input, so the floating button still appears for compose boxes
 *     on novel sites.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";
import { detectChannelFromUrl } from "../src/lib/translation-client.js";

export default defineContentScript({
  // `registration: "runtime"` plus an empty matches array tells WXT to
  // build the file as a content script but not auto-inject it. Chrome
  // still produces the bundle at `content-scripts/generic.js` which
  // the SW can target via `chrome.scripting.executeScript({files})`.
  matches: [],
  registration: "runtime",
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    const channel = detectChannelFromUrl(location.href);
    bootstrapContent({
      channel,
      // Per-tab unique id — the host-name suffix prevents collisions
      // with same-page navigations on SPA sites.
      hostId: `neurodock-generic-island-${location.host}`,
    });
  },
});
