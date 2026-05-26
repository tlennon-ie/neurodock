/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Outlook web content script. Channel: outlook.
 *
 * Covers outlook.live.com, outlook.office.com, outlook.office365.com.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: [
    "https://outlook.live.com/*",
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*",
  ],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({
      channel: "outlook",
      hostId: "neurodock-outlook-island",
    });
  },
});
