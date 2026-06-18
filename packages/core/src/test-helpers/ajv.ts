/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * ajv.ts — shared Ajv 2020 builder for the core schema tests.
 *
 * The three core schema tests (profile.test.ts, profile.schema.test.ts,
 * profile.presets.test.ts) all need an identically-configured Ajv2020 instance
 * with ajv-formats applied. This helper is the single source of that config so
 * the `addFormats` interop cast lives in one place rather than being duplicated
 * (and drifting) across three files.
 *
 * Test-only: Ajv + ajv-formats are dev dependencies. Importing this from
 * production code would break the zero-runtime-dependencies invariant, so it
 * lives under `test-helpers/` and is only ever imported by `*.test.ts` files.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// ajv-formats ships a CommonJS default export whose call signature is not
// visible through the ESM interop wrapper, so we narrow it once here.
const applyFormats = addFormats as unknown as (ajv: Ajv2020) => Ajv2020;

/**
 * Build a fresh Ajv 2020 instance configured exactly as the core schema tests
 * require: lenient strict mode (the schema uses draft-2020 features Ajv's strict
 * mode flags as warnings), union types allowed, all errors collected, and
 * ajv-formats applied so `pattern`/format keywords resolve.
 */
export function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  applyFormats(ajv);
  return ajv;
}
