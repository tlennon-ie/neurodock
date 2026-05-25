import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { atomicWriteNew } from "../util/atomic-write.js";
import { parse as parseYaml } from "yaml";
import prompts from "prompts";
import { readEnv } from "../lib/env.js";
import { pluginsDir } from "../lib/paths.js";
import {
  validatePluginManifest,
  type PluginValidationViolation,
} from "../lib/plugin-schema.js";

/**
 * Marker file written by `neurodock plugin enable <name>` inside the
 * plugin's install directory. Chosen over a central `plugins.yaml`
 * registry because:
 *   - presence-on-disk is the single source of truth for both "is
 *     installed" and "is enabled"
 *   - filesystem-only state lets the substrate walk
 *     `<pluginsDir>/<name>/` exactly per ADR 0007 with no extra file
 *     to keep in sync
 *   - removing the plugin directory naturally removes the enable state
 */
export const ENABLED_MARKER = ".enabled";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Minimum manifest shape the CLI reads. Forward-compat: unknown fields are
 * preserved on disk (we never re-serialize the manifest), and any field we
 * read but don't recognise is ignored without error.
 */
export interface PluginManifest {
  readonly name: string;
  readonly type: string;
  readonly version: string;
  readonly description?: string;
}

export type ExitCode = 0 | 1 | 2 | 3;

export interface PluginDependencies {
  readonly envOverrides?: Parameters<typeof readEnv>[0];
  /**
   * Prompt the user with a yes/no question. Tests can stub.
   * Defaults to interactive `prompts` (cancellation returns false).
   */
  readonly confirm?: (message: string) => Promise<boolean>;
}

interface LoadedManifest {
  readonly raw: unknown;
  readonly manifest: PluginManifest | null;
  readonly missing: boolean;
  readonly parseError?: string;
  readonly schemaViolations: ReadonlyArray<PluginValidationViolation>;
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export interface PluginAddOptions {
  readonly source: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
}

export interface PluginAddResult {
  readonly source: string;
  readonly resolvedSource: string;
  readonly destination: string;
  readonly manifest: PluginManifest | null;
  readonly action: "installed" | "overwritten" | "dry-run" | "aborted" | "fail";
  readonly messages: ReadonlyArray<string>;
  readonly violations: ReadonlyArray<PluginValidationViolation>;
  readonly exitCode: ExitCode;
}

export async function runPluginAdd(
  options: PluginAddOptions,
  deps: PluginDependencies = {},
): Promise<PluginAddResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];
  const resolvedSource = isAbsolute(options.source)
    ? options.source
    : resolve(env.cwd, options.source);

  // Validate source dir exists and is a directory.
  if (!existsSync(resolvedSource)) {
    messages.push(`Source path does not exist: ${resolvedSource}`);
    return failResult(
      "fail",
      options,
      resolvedSource,
      "",
      null,
      messages,
      [],
      1,
    );
  }
  const sourceStat = statSync(resolvedSource);
  if (!sourceStat.isDirectory()) {
    messages.push(`Source must be a directory: ${resolvedSource}`);
    return failResult(
      "fail",
      options,
      resolvedSource,
      "",
      null,
      messages,
      [],
      1,
    );
  }

  // Load + validate manifest.
  const loaded = loadManifest(resolvedSource);
  if (loaded.missing) {
    messages.push(`No plugin.yaml in ${resolvedSource}`);
    return failResult(
      "fail",
      options,
      resolvedSource,
      "",
      null,
      messages,
      [],
      1,
    );
  }
  if (loaded.parseError !== undefined) {
    messages.push(`Failed to parse plugin.yaml: ${loaded.parseError}`);
    return failResult(
      "fail",
      options,
      resolvedSource,
      "",
      null,
      messages,
      [],
      3,
    );
  }
  if (loaded.manifest === null) {
    messages.push("plugin.yaml is invalid:");
    for (const v of loaded.schemaViolations) {
      messages.push(`  ${v.path} (${v.keyword}): ${v.message}`);
    }
    return failResult(
      "fail",
      options,
      resolvedSource,
      "",
      null,
      messages,
      loaded.schemaViolations,
      3,
    );
  }

  const manifest = loaded.manifest;
  const destination = join(pluginsDir(env), manifest.name);
  const alreadyInstalled = existsSync(destination);

  if (alreadyInstalled && !options.force) {
    if (options.yes) {
      messages.push(
        `Plugin '${manifest.name}' is already installed at ${destination}.`,
      );
      messages.push("Re-run with --force to overwrite.");
      return {
        source: options.source,
        resolvedSource,
        destination,
        manifest,
        action: "aborted",
        messages,
        violations: [],
        exitCode: 2,
      };
    }
    const confirm = deps.confirm ?? defaultConfirm;
    const ok = await confirm(
      `Plugin '${manifest.name}' is already installed. Overwrite ${destination}?`,
    );
    if (!ok) {
      messages.push("Aborted. Existing install left in place.");
      return {
        source: options.source,
        resolvedSource,
        destination,
        manifest,
        action: "aborted",
        messages,
        violations: [],
        exitCode: 2,
      };
    }
  }

  if (options.dryRun) {
    messages.push(
      `Would install '${manifest.name}' (v${manifest.version}, type=${manifest.type})`,
    );
    messages.push(`  from: ${resolvedSource}`);
    messages.push(`  to:   ${destination}`);
    if (alreadyInstalled) {
      messages.push("  (would overwrite existing install)");
    }
    return {
      source: options.source,
      resolvedSource,
      destination,
      manifest,
      action: "dry-run",
      messages,
      violations: [],
      exitCode: 0,
    };
  }

  // Perform install: ensure parent dir, remove existing if overwriting, copy.
  mkdirSync(pluginsDir(env), { recursive: true });
  if (alreadyInstalled) {
    rmSync(destination, { recursive: true, force: true });
  }
  cpSync(resolvedSource, destination, { recursive: true });

  const action: PluginAddResult["action"] = alreadyInstalled
    ? "overwritten"
    : "installed";
  messages.push(
    `${alreadyInstalled ? "Overwrote" : "Installed"} plugin '${
      manifest.name
    }' (v${manifest.version}, type=${manifest.type})`,
  );
  messages.push(`  to: ${destination}`);
  messages.push("");
  messages.push("Next: restart your MCP client to pick up the new plugin.");
  messages.push(
    "Run 'neurodock plugin enable " +
      manifest.name +
      "' to activate it (disabled by default).",
  );

  return {
    source: options.source,
    resolvedSource,
    destination,
    manifest,
    action,
    messages,
    violations: [],
    exitCode: 0,
  };
}

function failResult(
  action: PluginAddResult["action"],
  options: PluginAddOptions,
  resolvedSource: string,
  destination: string,
  manifest: PluginManifest | null,
  messages: string[],
  violations: ReadonlyArray<PluginValidationViolation>,
  exitCode: ExitCode,
): PluginAddResult {
  return {
    source: options.source,
    resolvedSource,
    destination,
    manifest,
    action,
    messages,
    violations,
    exitCode,
  };
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export interface PluginRemoveOptions {
  readonly name: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
}

export interface PluginRemoveResult {
  readonly name: string;
  readonly destination: string;
  readonly action: "removed" | "dry-run" | "aborted" | "missing";
  readonly messages: ReadonlyArray<string>;
  readonly exitCode: 0 | 1;
}

export async function runPluginRemove(
  options: PluginRemoveOptions,
  deps: PluginDependencies = {},
): Promise<PluginRemoveResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];
  const destination = join(pluginsDir(env), options.name);

  if (!existsSync(destination)) {
    messages.push(
      `Plugin '${options.name}' is not installed (no ${destination}).`,
    );
    return {
      name: options.name,
      destination,
      action: "missing",
      messages,
      exitCode: 1,
    };
  }

  if (options.dryRun) {
    messages.push(`Would remove ${destination}`);
    return {
      name: options.name,
      destination,
      action: "dry-run",
      messages,
      exitCode: 0,
    };
  }

  if (!options.yes) {
    const confirm = deps.confirm ?? defaultConfirm;
    const ok = await confirm(
      `Remove plugin '${options.name}' from ${destination}?`,
    );
    if (!ok) {
      messages.push("Aborted. Plugin left in place.");
      return {
        name: options.name,
        destination,
        action: "aborted",
        messages,
        exitCode: 0,
      };
    }
  }

  rmSync(destination, { recursive: true, force: true });
  messages.push(`Removed plugin '${options.name}' from ${destination}`);
  return {
    name: options.name,
    destination,
    action: "removed",
    messages,
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export interface PluginListEntry {
  readonly name: string;
  readonly path: string;
  readonly enabled: boolean;
  readonly manifest: PluginManifest | null;
  readonly invalid: boolean;
}

export interface PluginListOptions {
  readonly json: boolean;
}

export interface PluginListResult {
  readonly root: string;
  readonly plugins: ReadonlyArray<PluginListEntry>;
  readonly messages: ReadonlyArray<string>;
}

export async function runPluginList(
  options: PluginListOptions,
  deps: PluginDependencies = {},
): Promise<PluginListResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const root = pluginsDir(env);
  const messages: string[] = [];
  const plugins: PluginListEntry[] = [];

  if (!existsSync(root)) {
    if (options.json) {
      messages.push(JSON.stringify({ root, plugins: [] }, null, 2));
    } else {
      messages.push(`No plugins installed (no ${root}).`);
    }
    return { root, plugins, messages };
  }

  const entries = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const name of entries) {
    const pluginPath = join(root, name);
    const enabled = existsSync(join(pluginPath, ENABLED_MARKER));
    const loaded = loadManifest(pluginPath);
    plugins.push({
      name,
      path: pluginPath,
      enabled,
      manifest: loaded.manifest,
      invalid: loaded.missing || loaded.manifest === null,
    });
  }

  if (options.json) {
    messages.push(
      JSON.stringify(
        {
          root,
          plugins: plugins.map((p) => ({
            name: p.name,
            path: p.path,
            enabled: p.enabled,
            invalid: p.invalid,
            ...(p.manifest
              ? {
                  manifest: {
                    name: p.manifest.name,
                    type: p.manifest.type,
                    version: p.manifest.version,
                  },
                }
              : {}),
          })),
        },
        null,
        2,
      ),
    );
    return { root, plugins, messages };
  }

  if (plugins.length === 0) {
    messages.push(`No plugins installed in ${root}.`);
    return { root, plugins, messages };
  }

  messages.push(`Installed plugins in ${root}:`);
  for (const p of plugins) {
    const state = p.enabled ? "enabled " : "disabled";
    const meta = p.manifest
      ? `${p.manifest.type} v${p.manifest.version}`
      : p.invalid
        ? "(invalid manifest)"
        : "(unknown)";
    messages.push(`  [${state}] ${p.name.padEnd(32)} ${meta}`);
  }
  return { root, plugins, messages };
}

// ---------------------------------------------------------------------------
// enable / disable
// ---------------------------------------------------------------------------

export interface PluginEnableOptions {
  readonly name: string;
}

export interface PluginEnableResult {
  readonly name: string;
  readonly destination: string;
  readonly markerPath: string;
  readonly action: "enabled" | "already-enabled" | "missing";
  readonly messages: ReadonlyArray<string>;
  readonly exitCode: 0 | 1;
}

export async function runPluginEnable(
  options: PluginEnableOptions,
  deps: PluginDependencies = {},
): Promise<PluginEnableResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];
  const destination = join(pluginsDir(env), options.name);
  const markerPath = join(destination, ENABLED_MARKER);

  if (!existsSync(destination)) {
    messages.push(
      `Plugin '${options.name}' is not installed (no ${destination}).`,
    );
    messages.push(
      "Run 'neurodock plugin add <source>' first, then 'plugin enable'.",
    );
    return {
      name: options.name,
      destination,
      markerPath,
      action: "missing",
      messages,
      exitCode: 1,
    };
  }

  if (existsSync(markerPath)) {
    messages.push(`Plugin '${options.name}' is already enabled.`);
    return {
      name: options.name,
      destination,
      markerPath,
      action: "already-enabled",
      messages,
      exitCode: 0,
    };
  }

  // Atomic exclusive create: the existsSync guard above and this write have
  // a TOCTOU window. O_CREAT | O_EXCL makes the check-and-create one
  // kernel operation — a concurrent enabler gets EEXIST rather than a race.
  atomicWriteNew(
    markerPath,
    `# Created by 'neurodock plugin enable'. Delete (or run\n# 'neurodock plugin disable ${options.name}') to deactivate.\n`,
  );
  messages.push(`Enabled plugin '${options.name}'.`);
  messages.push("Restart your MCP client to pick up the change.");
  return {
    name: options.name,
    destination,
    markerPath,
    action: "enabled",
    messages,
    exitCode: 0,
  };
}

export interface PluginDisableOptions {
  readonly name: string;
}

export interface PluginDisableResult {
  readonly name: string;
  readonly destination: string;
  readonly markerPath: string;
  readonly action: "disabled" | "already-disabled" | "missing";
  readonly messages: ReadonlyArray<string>;
  readonly exitCode: 0 | 1;
}

export async function runPluginDisable(
  options: PluginDisableOptions,
  deps: PluginDependencies = {},
): Promise<PluginDisableResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];
  const destination = join(pluginsDir(env), options.name);
  const markerPath = join(destination, ENABLED_MARKER);

  if (!existsSync(destination)) {
    messages.push(
      `Plugin '${options.name}' is not installed (no ${destination}).`,
    );
    return {
      name: options.name,
      destination,
      markerPath,
      action: "missing",
      messages,
      exitCode: 1,
    };
  }
  if (!existsSync(markerPath)) {
    messages.push(`Plugin '${options.name}' is already disabled.`);
    return {
      name: options.name,
      destination,
      markerPath,
      action: "already-disabled",
      messages,
      exitCode: 0,
    };
  }
  rmSync(markerPath, { force: true });
  messages.push(`Disabled plugin '${options.name}'.`);
  messages.push("Restart your MCP client to pick up the change.");
  return {
    name: options.name,
    destination,
    markerPath,
    action: "disabled",
    messages,
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

export interface PluginValidateOptions {
  readonly source: string;
  readonly json: boolean;
}

export interface PluginValidateResult {
  readonly source: string;
  readonly resolvedSource: string;
  readonly manifestPath: string;
  readonly valid: boolean;
  readonly missing: boolean;
  readonly parseError?: string;
  readonly violations: ReadonlyArray<PluginValidationViolation>;
  readonly manifest: PluginManifest | null;
  readonly messages: ReadonlyArray<string>;
  readonly exitCode: 0 | 1 | 2;
}

export async function runPluginValidate(
  options: PluginValidateOptions,
  deps: PluginDependencies = {},
): Promise<PluginValidateResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];
  const resolvedSource = isAbsolute(options.source)
    ? options.source
    : resolve(env.cwd, options.source);
  const manifestPath = join(resolvedSource, "plugin.yaml");

  if (!existsSync(resolvedSource) || !statSync(resolvedSource).isDirectory()) {
    if (options.json) {
      messages.push(
        JSON.stringify(
          {
            valid: false,
            missing: true,
            manifest_path: manifestPath,
            error: "source directory not found",
          },
          null,
          2,
        ),
      );
    } else {
      messages.push(`Source directory not found: ${resolvedSource}`);
    }
    return {
      source: options.source,
      resolvedSource,
      manifestPath,
      valid: false,
      missing: true,
      violations: [],
      manifest: null,
      messages,
      exitCode: 2,
    };
  }

  const loaded = loadManifest(resolvedSource);

  if (loaded.missing) {
    if (options.json) {
      messages.push(
        JSON.stringify(
          {
            valid: false,
            missing: true,
            manifest_path: manifestPath,
            error: "plugin.yaml not found",
          },
          null,
          2,
        ),
      );
    } else {
      messages.push(`Missing: ${manifestPath}`);
    }
    return {
      source: options.source,
      resolvedSource,
      manifestPath,
      valid: false,
      missing: true,
      violations: [],
      manifest: null,
      messages,
      exitCode: 2,
    };
  }

  if (loaded.parseError !== undefined) {
    const violations: PluginValidationViolation[] = [
      { path: "/", message: loaded.parseError, keyword: "parse" },
    ];
    if (options.json) {
      messages.push(
        JSON.stringify(
          {
            valid: false,
            missing: false,
            manifest_path: manifestPath,
            parse_error: loaded.parseError,
            violations,
          },
          null,
          2,
        ),
      );
    } else {
      messages.push(`Parse error in ${manifestPath}: ${loaded.parseError}`);
    }
    return {
      source: options.source,
      resolvedSource,
      manifestPath,
      valid: false,
      missing: false,
      parseError: loaded.parseError,
      violations,
      manifest: null,
      messages,
      exitCode: 1,
    };
  }

  if (loaded.manifest === null) {
    if (options.json) {
      messages.push(
        JSON.stringify(
          {
            valid: false,
            missing: false,
            manifest_path: manifestPath,
            violations: loaded.schemaViolations,
          },
          null,
          2,
        ),
      );
    } else {
      messages.push(`Invalid: ${manifestPath}`);
      for (const v of loaded.schemaViolations) {
        messages.push(`  ${v.path} (${v.keyword}): ${v.message}`);
      }
    }
    return {
      source: options.source,
      resolvedSource,
      manifestPath,
      valid: false,
      missing: false,
      violations: loaded.schemaViolations,
      manifest: null,
      messages,
      exitCode: 1,
    };
  }

  if (options.json) {
    messages.push(
      JSON.stringify(
        {
          valid: true,
          missing: false,
          manifest_path: manifestPath,
          manifest: {
            name: loaded.manifest.name,
            type: loaded.manifest.type,
            version: loaded.manifest.version,
          },
        },
        null,
        2,
      ),
    );
  } else {
    messages.push(`Valid: ${manifestPath}`);
    messages.push(
      `  name=${loaded.manifest.name} type=${loaded.manifest.type} version=${loaded.manifest.version}`,
    );
  }
  return {
    source: options.source,
    resolvedSource,
    manifestPath,
    valid: true,
    missing: false,
    violations: [],
    manifest: loaded.manifest,
    messages,
    exitCode: 0,
  };
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function loadManifest(pluginDir: string): LoadedManifest {
  const manifestPath = join(pluginDir, "plugin.yaml");
  if (!existsSync(manifestPath)) {
    return {
      raw: null,
      manifest: null,
      missing: true,
      schemaViolations: [],
    };
  }
  let raw: unknown;
  try {
    const text = readFileSync(manifestPath, "utf8");
    raw = parseYaml(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      raw: null,
      manifest: null,
      missing: false,
      parseError: message,
      schemaViolations: [],
    };
  }
  const result = validatePluginManifest(raw);
  if (!result.valid) {
    return {
      raw,
      manifest: null,
      missing: false,
      schemaViolations: result.violations,
    };
  }
  // Schema-valid: extract the fields we use.
  const obj = raw as Record<string, unknown>;
  const manifest: PluginManifest = {
    name: String(obj["name"]),
    type: String(obj["type"]),
    version: String(obj["version"]),
    ...(typeof obj["description"] === "string"
      ? { description: obj["description"] }
      : {}),
  };
  return {
    raw,
    manifest,
    missing: false,
    schemaViolations: [],
  };
}

async function defaultConfirm(message: string): Promise<boolean> {
  const response = await prompts(
    {
      type: "confirm",
      name: "ok",
      message,
      initial: false,
    },
    {
      onCancel: () => {
        return false;
      },
    },
  );
  return response.ok === true;
}
