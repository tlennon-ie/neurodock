import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import type { CheckResult } from "../types.js";
import { readEnv } from "../lib/env.js";
import { profilePath, detectClients } from "../lib/paths.js";
import { loadProfileFromFile } from "../profile/loader.js";
import { validateProfile } from "../profile/validator.js";
import { parseJsonSafely } from "../lib/json-patch.js";

export interface DoctorResult {
  readonly checks: ReadonlyArray<CheckResult>;
  readonly ok: boolean;
}

export async function runDoctor(): Promise<DoctorResult> {
  const env = readEnv();
  const checks: CheckResult[] = [];

  checks.push(checkNodeVersion());
  checks.push(checkCommandAvailable("uv", ["--version"]));
  checks.push(checkPython());

  // Profile presence + validity.
  const pPath = profilePath(env);
  if (!existsSync(pPath)) {
    checks.push({
      name: "Profile exists",
      status: "FAIL",
      detail: `No profile at ${pPath}. Run 'neurodock init' to create one.`,
    });
  } else {
    checks.push({ name: "Profile exists", status: "PASS", detail: pPath });
    try {
      const loaded = loadProfileFromFile(pPath);
      const result = validateProfile(loaded.raw);
      if (result.valid) {
        checks.push({ name: "Profile schema valid", status: "PASS" });
      } else {
        checks.push({
          name: "Profile schema valid",
          status: "FAIL",
          detail: result.violations
            .map((v) => `${v.path}: ${v.message}`)
            .join("; "),
        });
      }
    } catch (err: unknown) {
      checks.push({
        name: "Profile schema valid",
        status: "FAIL",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Client configs syntax check.
  const detections = detectClients(env);
  const existing = detections.filter((d) => d.exists);
  if (existing.length === 0) {
    checks.push({
      name: "Client configs",
      status: "SKIP",
      detail: "No supported client config found. Skipping wiring check.",
    });
  } else {
    for (const d of existing) {
      const raw = readFileSync(d.path, "utf8");
      const parsed = parseJsonSafely(raw);
      if (!parsed.ok) {
        checks.push({
          name: `Client config syntax: ${d.id} (${d.scope})`,
          status: "FAIL",
          detail: `${d.path}: ${parsed.error}`,
        });
        continue;
      }
      checks.push({
        name: `Client config syntax: ${d.id} (${d.scope})`,
        status: "PASS",
        detail: d.path,
      });
      const cfg = (parsed.value ?? {}) as {
        mcpServers?: Record<string, unknown>;
      };
      const servers = cfg.mcpServers ?? {};
      const wired = Object.keys(servers).filter((k) =>
        k.startsWith("neurodock-"),
      );
      checks.push({
        name: `NeuroDock servers wired: ${d.id} (${d.scope})`,
        status: wired.length > 0 ? "PASS" : "FAIL",
        detail:
          wired.length > 0 ? wired.join(", ") : "no neurodock-* entries found",
      });
    }
  }

  const ok = checks.every((c) => c.status !== "FAIL");
  return { checks, ok };
}

function checkNodeVersion(): CheckResult {
  const v = process.versions.node;
  const major = Number.parseInt(v.split(".")[0] ?? "0", 10);
  if (Number.isFinite(major) && major >= 22) {
    return { name: "Node >= 22", status: "PASS", detail: `node ${v}` };
  }
  return { name: "Node >= 22", status: "FAIL", detail: `node ${v}` };
}

function checkCommandAvailable(
  cmd: string,
  args: ReadonlyArray<string>,
  label?: string,
): CheckResult {
  const name = label ?? `${cmd} available`;
  try {
    const out = execFileSync(cmd, args as string[], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 4000,
    });
    const text = out.toString().trim().split("\n")[0] ?? "";
    return { name, status: "PASS", detail: text };
  } catch (err: unknown) {
    const detail =
      err instanceof Error
        ? err.message.split("\n")[0] ?? "unknown error"
        : String(err);
    return { name, status: "FAIL", detail };
  }
}

interface PythonAttempt {
  readonly cmd: string;
  readonly args: ReadonlyArray<string>;
}

const PYTHON_CANDIDATES: ReadonlyArray<PythonAttempt> = [
  // Most Unix installs (and explicit pyenv shims).
  { cmd: "python3", args: ["--version"] },
  // Most Windows installs (and Conda / venvs everywhere).
  { cmd: "python", args: ["--version"] },
  // Windows Python launcher selecting >=3.x.
  { cmd: "py", args: ["-3", "--version"] },
];

function checkPython(): CheckResult {
  const name = "Python >= 3.11";
  const errors: string[] = [];
  for (const { cmd, args } of PYTHON_CANDIDATES) {
    try {
      const out = execFileSync(cmd, args as string[], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 4000,
      });
      const text = out.toString().trim().split("\n")[0] ?? "";
      const match = text.match(/(\d+)\.(\d+)/);
      if (!match) {
        errors.push(`${cmd}: unexpected version output "${text}"`);
        continue;
      }
      const major = Number(match[1]);
      const minor = Number(match[2]);
      const tooOld = major < 3 || (major === 3 && minor < 11);
      const detail = `${cmd} ${match[0]} (${text})`;
      return tooOld
        ? {
            name,
            status: "FAIL",
            detail: `${detail} is below 3.11. Upgrade Python.`,
          }
        : { name, status: "PASS", detail };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message.split("\n")[0] ?? "unknown error"
          : String(err);
      errors.push(`${cmd}: ${message}`);
    }
  }
  return {
    name,
    status: "FAIL",
    detail: `No Python interpreter found on PATH (tried python3, python, py -3). Errors: ${errors.join(
      "; ",
    )}`,
  };
}
