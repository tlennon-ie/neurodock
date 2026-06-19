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
  recheck: () => void;
} {
  const [status, setStatus] = useState<FullSetupStatus>("checking");
  const mounted = useRef(true);

  // `nativeMessaging` is an optional permission, so the auto-probe must stay
  // NON-interactive (no prompt without a user gesture). The "Check again"
  // button is the gesture that may request it — see `recheck`.
  const probe = useCallback(async (interactive: boolean) => {
    const hello = await probeNativeHost({ interactive });
    if (mounted.current) setStatus(hello.status);
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
    void probe(true);
  }, [probe]);

  return { status, recheck };
}
