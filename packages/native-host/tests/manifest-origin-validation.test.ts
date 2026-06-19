/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * findInvalidChromiumOrigins backs the `doctor` check that catches a manifest
 * Chrome would reject — the malformed gecko origin that reported the host as
 * "not found" while a direct launcher spawn ponged fine.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findInvalidChromiumOrigins } from "../src/registration/staging.js";
import { HOST_NAME } from "../src/registration/types.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
  roots.length = 0;
});

function tmpRoot(): string {
  const r = mkdtempSync(join(tmpdir(), "nd-origins-"));
  roots.push(r);
  return r;
}

function writeLinuxChromeManifest(
  root: string,
  allowed_origins: unknown,
): { home: string; env: NodeJS.ProcessEnv } {
  const home = join(root, "home");
  const cfg = join(root, "config");
  const dir = join(cfg, "google-chrome", "NativeMessagingHosts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${HOST_NAME}.json`),
    JSON.stringify({
      name: HOST_NAME,
      path: "/x/launcher.sh",
      type: "stdio",
      allowed_origins,
    }),
  );
  return { home, env: { XDG_CONFIG_HOME: cfg } };
}

describe("findInvalidChromiumOrigins", () => {
  it("returns the malformed gecko origin while accepting valid chrome origins", () => {
    const { home, env } = writeLinuxChromeManifest(tmpRoot(), [
      "chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/",
      "chrome-extension://neurodock-extension@neurodock.org/",
      "chrome-extension://jjcjkmljfdebbefdemkcgknjplgkicen/",
    ]);
    expect(findInvalidChromiumOrigins("linux", home, env)).toEqual([
      "chrome-extension://neurodock-extension@neurodock.org/",
    ]);
  });

  it("returns [] for an all-valid manifest", () => {
    const { home, env } = writeLinuxChromeManifest(tmpRoot(), [
      "chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/",
    ]);
    expect(findInvalidChromiumOrigins("linux", home, env)).toEqual([]);
  });

  it("returns [] when the manifest is absent (the launcher check reports that)", () => {
    const root = tmpRoot();
    expect(
      findInvalidChromiumOrigins("linux", join(root, "home"), {
        XDG_CONFIG_HOME: join(root, "none"),
      }),
    ).toEqual([]);
  });
});
