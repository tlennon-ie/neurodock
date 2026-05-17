/**
 * Slack web content script. Channel: slack.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { bootstrapContent } from "./_shared/bootstrap.js";

export default defineContentScript({
  matches: ["https://app.slack.com/*"],
  cssInjectionMode: "manual",
  runAt: "document_idle",
  main() {
    bootstrapContent({ channel: "slack", hostId: "neurodock-slack-island" });
  },
});
