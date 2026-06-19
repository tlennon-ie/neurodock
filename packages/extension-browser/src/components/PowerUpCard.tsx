/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * "Turn on full NeuroDock" — one copy-paste command + live connection state.
 * Replaces the three scattered CLI commands the settings used to list.
 * FULL_SETUP_COMMAND is the single place the command string is referenced
 * so it can be updated in one edit.
 */
import React, { useEffect, useRef, useState } from "react";
import { useFullSetupStatus } from "../lib/full-setup.js";

// `neurodock setup` installs the 6 MCP servers, wires MCP clients,
// registers the native-messaging host, and installs the Claude Code
// guardrail hooks in one go (the standalone daemon stays opt-in via
// --daemon).
//
// The `@latest` pin is deliberate: bare `npx @neurodock/cli setup`
// reuses whatever older copy npx already cached, which can predate the
// `setup` subcommand and fails with "unknown command 'setup'". `@latest`
// forces npx to resolve the current published version every time, matching
// the `npx --yes @neurodock/cli@latest …` form the docs already use.
export const FULL_SETUP_COMMAND = "npx @neurodock/cli@latest setup";

export function PowerUpCard(): React.ReactElement {
  const { status, detail, recheck } = useFullSetupStatus();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(FULL_SETUP_COMMAND);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
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
        {status === "checking" ? (
          "Checking…"
        ) : (
          <>
            Not connected yet.{" "}
            <button type="button" className="nd-linkbtn" onClick={recheck}>
              Check again
            </button>
          </>
        )}
      </p>
      {status !== "checking" && detail ? (
        <p
          data-testid="power-up-detail"
          className="nd-muted nd-powerup-detail"
          title={detail}
        >
          {detail}
        </p>
      ) : null}
    </section>
  );
}
