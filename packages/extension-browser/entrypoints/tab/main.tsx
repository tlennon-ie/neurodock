/**
 * @license AGPL-3.0-or-later
 *
 * Tab entrypoint bootstrap. Mounts the full-tab view at
 * chrome-extension://<id>/tab.html. The user reaches this page by
 * clicking "Open in tab" from the popup.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { TabApp } from "./App.js";
import "./styles.css";

const host = document.getElementById("root");
if (host) {
  createRoot(host).render(
    <React.StrictMode>
      <TabApp />
    </React.StrictMode>,
  );
}
