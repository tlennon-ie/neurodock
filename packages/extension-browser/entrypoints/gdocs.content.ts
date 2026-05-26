/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Google Docs content script. Channel: gdocs.
 *
 * Google Docs uses a canvas-rendered editor in many surfaces — the floating
 * button still anchors on the doc's focused input but in-doc text extraction
 * is limited in v0.0.1. Users who want full doc translation should select
 * text and use the right-click context-menu action.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: ["https://docs.google.com/*"],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({ channel: "gdocs", hostId: "neurodock-gdocs-island" });
  },
});
