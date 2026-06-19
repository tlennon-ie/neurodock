/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * "Full NeuroDock" connection status for the power-up card. WS1 treats the
 * native host being reachable (probeNativeHost → "active") as the signal that
 * the one-command setup ran. WS2 will enrich the ping with daemon/hooks
 * capability fields; this hook only depends on the existing ping today.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type NativeHostStatus,
  probeNativeHost,
} from "./native-host-client.js";

export type FullSetupStatus = NativeHostStatus | "checking";

export function useFullSetupStatus(pollMs = 4000): {
  status: FullSetupStatus;
  /**
   * When not connected, the reason from the last probe (timeout, host-not-found,
   * permission-not-granted, …). Surfaced so the card is diagnosable rather than
   * a silent "Not connected yet". Undefined when active.
   */
  detail?: string;
  recheck: () => void;
} {
  const [status, setStatus] = useState<FullSetupStatus>("checking");
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const mounted = useRef(true);
  // A probe spawns a fresh host process; with the generous cold-start timeout a
  // probe can outlast the poll interval. Skip overlapping AUTO-polls, but never
  // block the user's "Check again" gesture (it may need to prompt).
  const inFlight = useRef(false);

  // `nativeMessaging` is an optional permission, so the auto-probe must stay
  // NON-interactive (no prompt without a user gesture). The "Check again"
  // button is the gesture that may request it — see `recheck`.
  const probe = useCallback(async (interactive: boolean) => {
    if (inFlight.current && !interactive) return;
    inFlight.current = true;
    try {
      const hello = await probeNativeHost({ interactive });
      if (mounted.current) {
        setStatus(hello.status);
        setDetail(hello.status === "active" ? undefined : hello.detail);
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void probe(false);
    const id =
      pollMs > 0 ? setInterval(() => void probe(false), pollMs) : undefined;
    return () => {
      mounted.current = false;
      if (id) clearInterval(id);
    };
  }, [probe, pollMs]);

  // User gesture: allowed to request the optional nativeMessaging permission.
  const recheck = useCallback(() => {
    setStatus("checking");
    setDetail(undefined);
    void probe(true);
  }, [probe]);

  return { status, detail, recheck };
}
