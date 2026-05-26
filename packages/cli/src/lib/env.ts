/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { homedir, platform, userInfo } from "node:os";
import type { Platform } from "../types.js";

export interface EnvSnapshot {
  readonly platform: Platform;
  readonly home: string;
  readonly user: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export function readEnv(overrides: Partial<EnvSnapshot> = {}): EnvSnapshot {
  const plat = (overrides.platform ?? (platform() as Platform)) as Platform;
  const home = overrides.home ?? homedir();
  const env = overrides.env ?? process.env;
  const user = overrides.user ?? deriveUser(env);
  const cwd = overrides.cwd ?? process.cwd();
  return { platform: plat, home, user, cwd, env };
}

function deriveUser(env: NodeJS.ProcessEnv): string {
  const candidates = [env["USER"], env["USERNAME"], env["LOGNAME"]];
  for (const c of candidates) {
    if (c && c.trim().length > 0) {
      return c.trim();
    }
  }
  try {
    const info = userInfo();
    if (info.username && info.username.trim().length > 0) {
      return info.username.trim();
    }
  } catch {
    // userInfo() can throw on some sandboxes; fall through.
  }
  return "neurodock-user";
}

export function colorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env["NO_COLOR"] !== undefined && env["NO_COLOR"] !== "") {
    return false;
  }
  if (env["FORCE_COLOR"] !== undefined && env["FORCE_COLOR"] !== "") {
    return true;
  }
  return process.stdout.isTTY === true;
}
