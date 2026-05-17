/**
 * macOS registration. Drops a manifest into each browser's per-user
 * NativeMessagingHosts directory.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  HOST_NAME,
  buildFirefoxManifest,
  buildManifest,
  type RegistrationOptions,
  type RegistrationOutcome,
  type UnregisterOptions,
} from "./types.js";

interface BrowserTarget {
  readonly browser: string;
  readonly dir: string;
  readonly firefox?: boolean;
}

function targets(home: string): ReadonlyArray<BrowserTarget> {
  const base = join(home, "Library", "Application Support");
  return [
    { browser: "chrome", dir: join(base, "Google", "Chrome", "NativeMessagingHosts") },
    { browser: "chromium", dir: join(base, "Chromium", "NativeMessagingHosts") },
    { browser: "brave", dir: join(base, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts") },
    { browser: "edge", dir: join(base, "Microsoft Edge", "NativeMessagingHosts") },
    { browser: "vivaldi", dir: join(base, "Vivaldi", "NativeMessagingHosts") },
    { browser: "firefox", dir: join(base, "Mozilla", "NativeMessagingHosts"), firefox: true },
  ];
}

export function registerDarwin(opts: RegistrationOptions): ReadonlyArray<RegistrationOutcome> {
  const home = opts.home ?? homedir();
  const out: RegistrationOutcome[] = [];
  for (const t of targets(home)) {
    const manifestPath = join(t.dir, `${HOST_NAME}.json`);
    try {
      mkdirSync(t.dir, { recursive: true });
      const manifest = t.firefox ? buildFirefoxManifest(opts) : buildManifest(opts);
      const action = existsSync(manifestPath) ? "update" : "create";
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      out.push({ browser: t.browser, manifestPath, action });
    } catch (err) {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export function unregisterDarwin(opts: UnregisterOptions = {}): ReadonlyArray<RegistrationOutcome> {
  const home = opts.home ?? homedir();
  const out: RegistrationOutcome[] = [];
  for (const t of targets(home)) {
    const manifestPath = join(t.dir, `${HOST_NAME}.json`);
    if (!existsSync(manifestPath)) {
      out.push({ browser: t.browser, manifestPath, action: "skip", detail: "manifest not present" });
      continue;
    }
    try {
      rmSync(manifestPath);
      out.push({ browser: t.browser, manifestPath, action: "remove" });
    } catch (err) {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
