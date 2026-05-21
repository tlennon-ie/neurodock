import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Sandbox {
  readonly home: string;
  readonly cwd: string;
  readonly pluginsRoot: string;
  readonly profileYaml: string;
  readonly envOverrides: {
    readonly platform: "linux";
    readonly home: string;
    readonly cwd: string;
    readonly user: string;
    readonly env: NodeJS.ProcessEnv;
  };
  cleanup(): void;
}

export function makeSandbox(prefix = "neurodock-plugin-"): Sandbox {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  // Route ~/.neurodock to inside the sandbox via NEURODOCK_PROFILE_PATH.
  const profileYaml = join(home, "profile.yaml");
  const pluginsRoot = join(home, "plugins");
  return {
    home,
    cwd,
    pluginsRoot,
    profileYaml,
    envOverrides: {
      platform: "linux",
      home,
      cwd,
      user: "tester",
      env: { NEURODOCK_PROFILE_PATH: profileYaml } as NodeJS.ProcessEnv,
    },
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

/** Build a directory at `<base>/<name>` containing a valid plugin.yaml. */
export function writePluginSource(
  base: string,
  name: string,
  manifestOverrides: Record<string, unknown> = {},
): string {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, unknown> = {
    schema_version: "0.1.0",
    name,
    type: "skill",
    version: "0.1.0",
    description:
      "Test fixture plugin used by the @neurodock/cli plugin command tests.",
    license: "AGPL-3.0-or-later",
    trust: { level: "official" },
    ...manifestOverrides,
  };
  writeFileSync(join(dir, "plugin.yaml"), toYaml(manifest), "utf8");
  // Drop a placeholder asset file so the copy step has more than one file.
  writeFileSync(join(dir, "README.md"), `# ${name}\n`, "utf8");
  return dir;
}

/** Minimal YAML serializer for flat-ish manifest objects in tests. */
function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null) return "null";
  if (typeof value === "string") {
    if (value.includes("\n") || value.includes(":")) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((v) => `${pad}- ${toYaml(v, indent + 1).trimStart()}`)
      .join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    return keys
      .map((k) => {
        const v = obj[k];
        if (
          (v !== null && typeof v === "object" && !Array.isArray(v)) ||
          (Array.isArray(v) && v.length > 0 && typeof v[0] === "object")
        ) {
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
        }
        if (Array.isArray(v) && v.length > 0) {
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${toYaml(v, indent + 1)}`;
      })
      .join("\n");
  }
  return JSON.stringify(value);
}
