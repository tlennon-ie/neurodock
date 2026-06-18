/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Shared registration types.
 *
 * Chrome Native Messaging host registration differs per OS:
 *   - macOS / Linux: drop a JSON manifest into a per-browser directory
 *     under the user's config root.
 *   - Windows: write a registry key whose default value points at the
 *     manifest JSON on disk.
 */
export const HOST_NAME = "com.neurodock.profile";

/**
 * Extension ids NeuroDock registers by default so a store-installed
 * extension can reach the native host with zero extra steps.
 *
 *   - `lcdaiekokkgniiknejddojkfkoiinopo` — the published Chrome Web Store
 *     id (used in the Chromium manifest's `allowed_origins`).
 *   - `neurodock-extension@neurodock.org` — the Firefox gecko id (used in
 *     the Firefox manifest's `allowed_extensions`).
 *
 * Both ids are written into BOTH manifests (each builder maps the same
 * list). The cross-store entry — e.g. a `chrome-extension://<gecko-id>/`
 * origin in the Chrome manifest — is simply never matched by that browser,
 * so carrying one list for both is harmless and keeps a single source of
 * truth. This replaces the old `__NEURODOCK_EXTENSION_ID__` placeholder,
 * which was never substituted and so matched no extension at all.
 */
export const PUBLISHED_EXTENSION_IDS: ReadonlyArray<string> = [
  "lcdaiekokkgniiknejddojkfkoiinopo",
  "neurodock-extension@neurodock.org",
];

/**
 * Union the caller-provided extension ids (e.g. a locally-loaded unpacked
 * build, whose id differs from the published one) with the published
 * defaults — deduped, defaults first. Always keeping the published ids
 * means a developer who later installs from the store still works without
 * re-running the installer.
 */
export function withDefaultExtensionIds(
  provided: ReadonlyArray<string>,
): string[] {
  return Array.from(new Set([...PUBLISHED_EXTENSION_IDS, ...provided]));
}

export type RegistrationAction = "create" | "skip" | "update" | "remove";

export interface RegistrationOutcome {
  readonly browser: string;
  readonly manifestPath: string;
  readonly action: RegistrationAction;
  readonly detail?: string | undefined;
}

export interface RegistrationOptions {
  readonly hostPath: string;
  readonly allowedExtensionIds: ReadonlyArray<string>;
  readonly home?: string;
}

export interface UnregisterOptions {
  readonly home?: string;
}

export function buildManifest(
  opts: RegistrationOptions,
): Record<string, unknown> {
  return {
    name: HOST_NAME,
    description:
      "NeuroDock native messaging host. Exposes ~/.neurodock/profile.yaml to the browser extension.",
    path: opts.hostPath,
    type: "stdio",
    allowed_origins: opts.allowedExtensionIds.map(
      (id) => `chrome-extension://${id}/`,
    ),
  };
}

export function buildFirefoxManifest(
  opts: RegistrationOptions,
): Record<string, unknown> {
  return {
    name: HOST_NAME,
    description:
      "NeuroDock native messaging host. Exposes ~/.neurodock/profile.yaml to the browser extension.",
    path: opts.hostPath,
    type: "stdio",
    allowed_extensions: [...opts.allowedExtensionIds],
  };
}
