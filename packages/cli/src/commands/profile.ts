import { existsSync } from "node:fs";
import { readEnv } from "../lib/env.js";
import { profilePath } from "../lib/paths.js";
import { loadProfileFromFile, renderResolvedYaml } from "../profile/loader.js";
import {
  validateProfile,
  type ValidationResult,
} from "../profile/validator.js";

export interface ValidateResult {
  readonly path: string;
  readonly result: ValidationResult;
  readonly missing: boolean;
}

export async function runProfileValidate(): Promise<ValidateResult> {
  const env = readEnv();
  const p = profilePath(env);
  if (!existsSync(p)) {
    return {
      path: p,
      missing: true,
      result: {
        valid: false,
        violations: [
          {
            path: "/",
            message: "profile file does not exist",
            keyword: "missing",
          },
        ],
      },
    };
  }
  const loaded = loadProfileFromFile(p);
  const result = validateProfile(loaded.raw);
  return { path: p, missing: false, result };
}

export interface ShowResult {
  readonly path: string;
  readonly yaml: string;
  readonly missing: boolean;
}

export async function runProfileShow(): Promise<ShowResult> {
  const env = readEnv();
  const p = profilePath(env);
  if (!existsSync(p)) {
    return { path: p, yaml: "", missing: true };
  }
  const loaded = loadProfileFromFile(p);
  return { path: p, yaml: renderResolvedYaml(loaded.resolved), missing: false };
}
