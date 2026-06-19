/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Regression guard for the connectivity bug: the extension manifest must
 * declare `nativeMessaging` so `chrome.runtime.connectNative` is exposed.
 * It lives in `optional_permissions` (not `permissions`) on purpose — the
 * permission is requested at runtime on the "Turn on full NeuroDock" gesture,
 * so a plain install adds no native-messaging warning. Without this entry the
 * native host can never connect and "full NeuroDock" stays unreachable.
 */
import { describe, it, expect } from "vitest";
import config from "../../wxt.config.js";

function manifestOf(cfg: unknown): {
  permissions?: string[];
  optional_permissions?: string[];
} {
  const m = (cfg as { manifest?: unknown }).manifest;
  return (m ?? {}) as {
    permissions?: string[];
    optional_permissions?: string[];
  };
}

describe("extension manifest — native messaging", () => {
  it("declares nativeMessaging as an optional permission", () => {
    const { optional_permissions } = manifestOf(config);
    expect(optional_permissions ?? []).toContain("nativeMessaging");
  });

  it("does NOT put nativeMessaging in install-time permissions (no install warning)", () => {
    const { permissions } = manifestOf(config);
    expect(permissions ?? []).not.toContain("nativeMessaging");
  });
});
