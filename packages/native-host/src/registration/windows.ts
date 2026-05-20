/**
 * Windows registration.
 *
 * The manifest JSON lives under %APPDATA%\NeuroDock\native-host\, and
 * each browser is wired up by writing a registry key under
 * HKCU\Software\<browser>\NativeMessagingHosts\com.neurodock.profile
 * whose default value is the absolute manifest path. We shell out to
 * `reg.exe` rather than depending on a native registry binding so the
 * package stays pure-Node and AGPL-compatible.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
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
  readonly registryKey: string;
  readonly firefox?: boolean;
}

function manifestDir(home: string, env: NodeJS.ProcessEnv): string {
  const appdata = env["APPDATA"];
  const root =
    appdata && appdata.trim().length > 0
      ? appdata
      : join(home, "AppData", "Roaming");
  return join(root, "NeuroDock", "native-host");
}

function targets(): ReadonlyArray<BrowserTarget> {
  return [
    {
      browser: "chrome",
      registryKey: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    },
    {
      browser: "chromium",
      registryKey: `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
    },
    {
      browser: "edge",
      registryKey: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
    },
    {
      browser: "brave",
      registryKey: `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`,
    },
    {
      browser: "firefox",
      registryKey: `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`,
      firefox: true,
    },
  ];
}

function writeRegistryKey(
  key: string,
  value: string,
): { ok: boolean; detail?: string } {
  const result = spawnSync(
    "reg",
    ["add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f"],
    { stdio: "pipe", encoding: "utf8" },
  );
  if (result.error) {
    return { ok: false, detail: result.error.message };
  }
  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      detail: (result.stderr || result.stdout || "reg.exe failed").trim(),
    };
  }
  return { ok: true };
}

function deleteRegistryKey(key: string): { ok: boolean; detail?: string } {
  const result = spawnSync("reg", ["delete", key, "/f"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.error) {
    return { ok: false, detail: result.error.message };
  }
  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      detail: (result.stderr || result.stdout || "reg.exe failed").trim(),
    };
  }
  return { ok: true };
}

export function registerWindows(
  opts: RegistrationOptions,
): ReadonlyArray<RegistrationOutcome> {
  const home = opts.home ?? homedir();
  const dir = manifestDir(home, process.env);
  mkdirSync(dir, { recursive: true });

  const chromiumManifestPath = join(dir, `${HOST_NAME}.json`);
  const firefoxManifestPath = join(dir, `${HOST_NAME}.firefox.json`);
  writeFileSync(
    chromiumManifestPath,
    JSON.stringify(buildManifest(opts), null, 2),
    "utf8",
  );
  writeFileSync(
    firefoxManifestPath,
    JSON.stringify(buildFirefoxManifest(opts), null, 2),
    "utf8",
  );

  const out: RegistrationOutcome[] = [];
  for (const t of targets()) {
    const manifestPath = t.firefox ? firefoxManifestPath : chromiumManifestPath;
    const r = writeRegistryKey(t.registryKey, manifestPath);
    if (r.ok) {
      out.push({ browser: t.browser, manifestPath, action: "create" });
    } else {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: r.detail,
      });
    }
  }
  return out;
}

export function unregisterWindows(
  opts: UnregisterOptions = {},
): ReadonlyArray<RegistrationOutcome> {
  const home = opts.home ?? homedir();
  const dir = manifestDir(home, process.env);
  const chromiumManifestPath = join(dir, `${HOST_NAME}.json`);
  const firefoxManifestPath = join(dir, `${HOST_NAME}.firefox.json`);

  const out: RegistrationOutcome[] = [];
  for (const t of targets()) {
    const r = deleteRegistryKey(t.registryKey);
    const manifestPath = t.firefox ? firefoxManifestPath : chromiumManifestPath;
    if (r.ok) {
      out.push({ browser: t.browser, manifestPath, action: "remove" });
    } else {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: r.detail,
      });
    }
  }

  for (const p of [chromiumManifestPath, firefoxManifestPath]) {
    if (existsSync(p)) {
      try {
        rmSync(p);
      } catch {
        // Best effort.
      }
    }
  }
  return out;
}
