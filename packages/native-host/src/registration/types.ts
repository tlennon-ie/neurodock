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
