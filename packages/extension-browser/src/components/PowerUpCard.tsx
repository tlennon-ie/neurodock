/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * "Turn on full NeuroDock" — one copy-paste command + live connection state.
 * Replaces the three scattered CLI commands the settings used to list.
 * The exact command string is owned by a later workstream; FULL_SETUP_COMMAND
 * is the single place it is referenced so it can be updated in one edit.
 */
import React, { useState } from "react";
import { useFullSetupStatus } from "../lib/full-setup.js";

// One command installs native-host + guardrail daemon + hooks together.
export const FULL_SETUP_COMMAND = "npx @neurodock/cli setup";

export function PowerUpCard(): React.ReactElement {
  const { status, recheck } = useFullSetupStatus();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(FULL_SETUP_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the command is still visible to select manually */
    }
  }

  if (status === "active") {
    return (
      <section
        className="nd-powerup nd-powerup--on"
        aria-labelledby="powerup-heading"
      >
        <h3 id="powerup-heading">Full NeuroDock</h3>
        <p data-testid="power-up-status" className="nd-powerup-status">
          ✓ Connected — memory, pacing, and always-on check-ins are on.
        </p>
      </section>
    );
  }

  return (
    <section className="nd-powerup" aria-labelledby="powerup-heading">
      <h3 id="powerup-heading">Turn on full NeuroDock</h3>
      <p className="nd-muted">
        Adds memory across chats, pacing, and always-on check-ins. Run this once
        in a terminal — it sets everything up in one go.
      </p>
      <div className="nd-powerup-cmd">
        <code data-testid="power-up-command">{FULL_SETUP_COMMAND}</code>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy command"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p data-testid="power-up-status" className="nd-muted">
        Not connected yet.{" "}
        <button type="button" className="nd-linkbtn" onClick={recheck}>
          Check again
        </button>
      </p>
    </section>
  );
}
