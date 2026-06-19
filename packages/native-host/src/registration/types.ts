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
 * One list is carried for both stores, but each builder emits ONLY the ids
 * that are valid for its browser — see `isChromiumExtensionId` /
 * `isFirefoxExtensionId`. This is NOT cosmetic: Chrome validates every
 * `allowed_origins` entry against `chrome-extension://[a-p]{32}/` and rejects
 * the ENTIRE manifest if any entry is malformed (e.g. a gecko id wedged into a
 * `chrome-extension://` origin), reporting the host as "not found". A previous
 * version mapped the whole list into both manifests, so every Chromium browser
 * got the Firefox gecko id as an invalid origin and refused to load the host.
 * This replaces the old `__NEURODOCK_EXTENSION_ID__` placeholder, which was
 * never substituted and so matched no extension at all.
 */
export const PUBLISHED_EXTENSION_IDS: ReadonlyArray<string> = [
  "lcdaiekokkgniiknejddojkfkoiinopo",
  "neurodock-extension@neurodock.org",
];

/**
 * Chrome / Chromium / Edge / Brave / Vivaldi extension id: exactly 32 chars
 * from a–p (the alphabet Chromium derives ids in). Only these are valid inside
 * a `chrome-extension://<id>/` origin; anything else makes Chrome reject the
 * whole native-messaging manifest.
 */
export function isChromiumExtensionId(id: string): boolean {
  return /^[a-p]{32}$/.test(id);
}

/**
 * Firefox (gecko) add-on id: either an email-like `name@domain` or a UUID in
 * braces, e.g. `{d3b0…-…-…-…-…}`. These are the only forms valid in a Firefox
 * manifest's `allowed_extensions`.
 */
export function isFirefoxExtensionId(id: string): boolean {
  return (
    /^[^@\s/]+@[^@\s/]+$/.test(id) ||
    /^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$/.test(
      id,
    )
  );
}

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
  /**
   * Override the process environment used to resolve config roots
   * (`APPDATA`, `XDG_CONFIG_HOME`). Defaults to `process.env`. Tests inject
   * a sandbox env so the per-OS layout is exercisable without writing to the
   * real user directories.
   */
  readonly env?: NodeJS.ProcessEnv;
}

export interface UnregisterOptions {
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
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
    // Only valid Chromium ids — a single malformed origin makes Chrome reject
    // the entire manifest ("Specified native messaging host not found").
    allowed_origins: opts.allowedExtensionIds
      .filter(isChromiumExtensionId)
      .map((id) => `chrome-extension://${id}/`),
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
    // Only valid gecko ids belong in a Firefox manifest's allowed_extensions.
    allowed_extensions: opts.allowedExtensionIds.filter(isFirefoxExtensionId),
  };
}
