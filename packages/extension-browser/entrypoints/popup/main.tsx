/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const host = document.getElementById("root");
if (host) {
  createRoot(host).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
