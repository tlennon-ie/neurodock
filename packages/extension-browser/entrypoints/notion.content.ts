/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Notion content script. Channel: notion.
 *
 * Matches cover Notion's three tenant URL shapes:
 *   - https://www.notion.so/*          — personal workspaces
 *   - https://*.notion.so/*            — paid-plan workspace tenants
 *                                         (e.g. https://acme.notion.so/...)
 *   - https://*.notion.site/*          — public shared pages
 *
 * Pre-0.0.8 only the `www.notion.so` form was matched. Workspace users
 * on `<tenant>.notion.so` and public-page viewers on `*.notion.site`
 * got zero injection.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: [
    "https://www.notion.so/*",
    "https://*.notion.so/*",
    "https://*.notion.site/*",
  ],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({ channel: "notion", hostId: "neurodock-notion-island" });
  },
});
