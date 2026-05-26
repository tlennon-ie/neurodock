/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Linear content script. Channel: linear.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: ["https://linear.app/*"],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({ channel: "linear", hostId: "neurodock-linear-island" });
  },
});
