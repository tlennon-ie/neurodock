/**
 * GitHub content script. Channel: github.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: ["https://github.com/*"],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({ channel: "github", hostId: "neurodock-github-island" });
  },
});
