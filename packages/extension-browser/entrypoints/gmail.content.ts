/**
 * Gmail content script. Channel: email.
 *
 * Gmail is a single-page app; the mutation observer in the shared
 * selectionWatcher handles re-injection across navigations.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: ["https://mail.google.com/*"],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({ channel: "email", hostId: "neurodock-gmail-island" });
  },
});
