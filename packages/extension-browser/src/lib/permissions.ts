/**
 * Host-permission helpers for non-localhost local providers.
 *
 * v0.0.4 lets users point LM Studio / Ollama at a non-localhost host
 * (e.g. a Windows APIPA address `169.254.83.107`, a Tailscale node, or a
 * LAN box). The MV3 CSP `connect-src` directive declares the port is on
 * the allow-list at the platform layer, but each *specific host* must
 * also be granted as an extension host-permission at runtime before the
 * fetch can succeed.
 *
 * This module is the single entry point for that runtime grant.
 *
 *   - `requestHostPermission(baseUrl)` — derives the origin from the
 *     base URL and calls `chrome.permissions.request({ origins: [...] })`.
 *     Localhost / 127.0.0.1 short-circuit to `{ granted: true }` because
 *     they are already covered by the default optional_host_permissions
 *     entries and are not gated by a runtime prompt.
 *
 *   - `revokeHostPermission(baseUrl)` — symmetric removal. Used by the
 *     Settings "Host permissions" panel.
 *
 *   - `hasHostPermission(baseUrl)` — non-prompting check. Use this
 *     before fetches so the provider can emit a precise
 *     `*_PERMISSION_REQUIRED` error rather than the opaque CSP-blocked
 *     "Failed to fetch" the user would otherwise see.
 *
 *   - `listGrantedNonDefaultOrigins()` — powers the "Host permissions"
 *     panel in Settings.
 *
 * IMPORTANT: Chrome and Firefox both require `permissions.request()` to
 * be invoked from a user-gesture context (e.g. a click handler). Do not
 * wrap calls in arbitrary async chains that break the gesture; the
 * Settings UI calls these from direct click handlers.
 *
 * Firefox 84+ implements `browser.permissions.request()` under the same
 * gesture requirement; the chrome.* shim resolves to the same surface
 * because WXT polyfills `browser` onto `chrome` for MV3 builds. No
 * Firefox-specific branch is required at the call site, but the gesture
 * constraint is real on both browsers.
 */

export interface HostPermissionResult {
  readonly granted: boolean;
  readonly origin: string;
  readonly reason?: "user-denied" | "invalid-url" | "api-unavailable";
}

/**
 * Origins that are pre-granted (or trivially granted) and therefore do
 * not need to trigger the chrome.permissions.request() prompt.
 *
 * Localhost and 127.0.0.1 are listed in `optional_host_permissions` in
 * the manifest, and the corresponding `connect-src` CSP entries are
 * already present. Chrome treats `http://localhost/*` and
 * `http://127.0.0.1/*` as always-available; chrome.permissions.contains
 * returns true for them without a runtime prompt.
 */
const ALWAYS_GRANTED_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
]);

function parseOrigin(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isAlwaysGranted(origin: string): boolean {
  try {
    const u = new URL(origin);
    return ALWAYS_GRANTED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

interface PermissionsApi {
  readonly request: (perm: chrome.permissions.Permissions) => Promise<boolean>;
  readonly contains: (perm: chrome.permissions.Permissions) => Promise<boolean>;
  readonly remove: (perm: chrome.permissions.Permissions) => Promise<boolean>;
  readonly getAll: () => Promise<chrome.permissions.Permissions>;
}

function getPermissionsApi(): PermissionsApi | null {
  const c = (globalThis as { chrome?: typeof chrome }).chrome;
  if (!c?.permissions) return null;
  return {
    request: (perm) =>
      new Promise((resolve) => {
        try {
          // The Chrome callback API is the most portable surface for
          // both Chrome MV3 and Firefox WebExtensions; the result is
          // a boolean indicating whether the user accepted.
          c.permissions.request(perm, (granted) => resolve(Boolean(granted)));
        } catch {
          resolve(false);
        }
      }),
    contains: (perm) =>
      new Promise((resolve) => {
        try {
          c.permissions.contains(perm, (has) => resolve(Boolean(has)));
        } catch {
          resolve(false);
        }
      }),
    remove: (perm) =>
      new Promise((resolve) => {
        try {
          c.permissions.remove(perm, (ok) => resolve(Boolean(ok)));
        } catch {
          resolve(false);
        }
      }),
    getAll: () =>
      new Promise((resolve) => {
        try {
          c.permissions.getAll((all) => resolve(all ?? {}));
        } catch {
          resolve({});
        }
      }),
  };
}

/**
 * Request host permission for the origin derived from `baseUrl`.
 *
 *   - If the origin is localhost / 127.0.0.1, return `{ granted: true }`
 *     immediately. No prompt fires because the default
 *     `optional_host_permissions` already covers it.
 *   - If the origin is anything else, call
 *     `chrome.permissions.request({ origins: ['<origin>/*'] })`.
 *
 * MUST be called from a user-gesture handler (click, keydown). Returning
 * the promise across an `await` boundary in a click handler is fine on
 * Chrome and Firefox; chaining through a debounce or setTimeout is not.
 */
export async function requestHostPermission(
  baseUrl: string,
): Promise<HostPermissionResult> {
  const origin = parseOrigin(baseUrl);
  if (origin === null) {
    return { granted: false, origin: "", reason: "invalid-url" };
  }
  if (isAlwaysGranted(origin)) {
    return { granted: true, origin };
  }
  const api = getPermissionsApi();
  if (api === null) {
    // No chrome.permissions surface available (e.g. unit test without
    // the shim). Treat as unavailable rather than silently passing.
    return { granted: false, origin, reason: "api-unavailable" };
  }
  const pattern = `${origin}/*`;
  // Short-circuit if already granted — avoid an unnecessary prompt on
  // every Save/Test click.
  const already = await api.contains({ origins: [pattern] });
  if (already) {
    return { granted: true, origin };
  }
  const ok = await api.request({ origins: [pattern] });
  if (ok) {
    return { granted: true, origin };
  }
  return { granted: false, origin, reason: "user-denied" };
}

/**
 * Revoke a previously granted non-localhost host permission. Localhost
 * and 127.0.0.1 short-circuit because they cannot be revoked (they are
 * declared in optional_host_permissions and Chrome treats them as
 * always available).
 */
export async function revokeHostPermission(
  baseUrl: string,
): Promise<HostPermissionResult> {
  const origin = parseOrigin(baseUrl);
  if (origin === null) {
    return { granted: false, origin: "", reason: "invalid-url" };
  }
  if (isAlwaysGranted(origin)) {
    return { granted: true, origin };
  }
  const api = getPermissionsApi();
  if (api === null) {
    return { granted: false, origin, reason: "api-unavailable" };
  }
  await api.remove({ origins: [`${origin}/*`] });
  return { granted: false, origin };
}

/**
 * Non-prompting check. Returns true if the origin is either always
 * granted (localhost / 127.0.0.1) or has been explicitly granted by
 * the user.
 *
 * Use this before any fetch to a non-localhost local provider so the
 * provider layer can emit a precise `*_PERMISSION_REQUIRED` error
 * instead of the opaque CSP-blocked "Failed to fetch".
 */
export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const origin = parseOrigin(baseUrl);
  if (origin === null) return false;
  if (isAlwaysGranted(origin)) return true;
  const api = getPermissionsApi();
  if (api === null) return false;
  return api.contains({ origins: [`${origin}/*`] });
}

/**
 * Return the list of currently granted host origins that are NOT in
 * the default optional_host_permissions set. Powers the "Host
 * permissions" panel in Settings so users can see and revoke per-host
 * grants they made for non-localhost local providers.
 *
 * The default-granted origins (localhost, 127.0.0.1) and cloud-provider
 * hosts (api.anthropic.com, api.openai.com, openrouter.ai) are filtered
 * out — those are managed by the existing cloud-mode flow.
 */
const DEFAULT_HIDDEN_ORIGIN_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "api.anthropic.com",
  "api.openai.com",
  "openrouter.ai",
]);

export async function listGrantedNonDefaultOrigins(): Promise<
  readonly string[]
> {
  const api = getPermissionsApi();
  if (api === null) return [];
  const all = await api.getAll();
  const origins = all.origins ?? [];
  const out: string[] = [];
  for (const pattern of origins) {
    // Patterns look like "http://169.254.83.107:1234/*". Strip the
    // trailing "/*" to get the origin; skip any that do not parse.
    const trimmed = pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;
    let host: string;
    try {
      host = new URL(trimmed).hostname;
    } catch {
      continue;
    }
    if (DEFAULT_HIDDEN_ORIGIN_HOSTS.has(host)) continue;
    // Skip per-site origins shipped in default host_permissions.
    if (
      host === "mail.google.com" ||
      host === "app.slack.com" ||
      host === "linear.app" ||
      host === "www.notion.so" ||
      host === "github.com" ||
      host === "docs.google.com" ||
      host === "outlook.live.com" ||
      host === "outlook.office.com" ||
      host === "outlook.office365.com"
    ) {
      continue;
    }
    out.push(trimmed);
  }
  return out;
}
