/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import * as nativeHost from "../../src/lib/native-host-client.js";
import { useFullSetupStatus } from "../../src/lib/full-setup.js";

describe("useFullSetupStatus", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.restoreAllMocks());

  it("starts as checking then resolves to connected when the host is active", async () => {
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "active",
      version: "0.1.0",
    });
    const { result } = renderHook(() => useFullSetupStatus(0));
    expect(result.current.status).toBe("checking");
    await waitFor(() => expect(result.current.status).toBe("active"));
  });

  it("resolves to absent when the host is not installed", async () => {
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "absent",
    });
    const { result } = renderHook(() => useFullSetupStatus(0));
    await waitFor(() => expect(result.current.status).toBe("absent"));
  });

  it("surfaces the probe detail when not connected (diagnosable, not a black box)", async () => {
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "absent",
      detail: "native host: request nd-1 timed out after 5000ms",
    });
    const { result } = renderHook(() => useFullSetupStatus(0));
    await waitFor(() => expect(result.current.status).toBe("absent"));
    expect(result.current.detail).toBe(
      "native host: request nd-1 timed out after 5000ms",
    );
  });

  it("clears the detail once connected", async () => {
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "active",
      version: "0.3.1",
    });
    const { result } = renderHook(() => useFullSetupStatus(0));
    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.detail).toBeUndefined();
  });

  it("recheck re-probes on demand", async () => {
    const spy = vi
      .spyOn(nativeHost, "probeNativeHost")
      .mockResolvedValue({ status: "absent" });
    const { result } = renderHook(() => useFullSetupStatus(0));
    await waitFor(() => expect(result.current.status).toBe("absent"));
    spy.mockResolvedValue({ status: "active", version: "0.1.0" });
    result.current.recheck();
    await waitFor(() => expect(result.current.status).toBe("active"));
  });
});
