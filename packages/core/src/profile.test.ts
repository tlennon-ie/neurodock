/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * profile.test.ts — links the hand-written `Profile` type to the canonical
 * JSON Schema. A typed fixture that exercises every R5 field is validated
 * against the Ajv-compiled schema; if the type permits a shape the schema
 * rejects (or vice versa) this test fails, preventing the two from drifting.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import type { ValidateFunction } from "ajv";
import { buildAjv } from "./test-helpers/ajv.js";
import type { Profile } from "./profile.js";

const here = dirname(fileURLToPath(import.meta.url));

function readSchema(): object {
  const raw = readFileSync(
    resolve(here, "..", "schemas", "profile.schema.json"),
    "utf8",
  );
  return JSON.parse(raw) as object;
}

let validate: ValidateFunction;

beforeAll(() => {
  validate = buildAjv().compile(readSchema());
});

describe("Profile type ↔ schema", () => {
  test("a minimal typed Profile validates against the schema", () => {
    const profile: Profile = {
      identity: { display_name: "T", neurotypes: ["adhd"] },
    };
    expect(validate(profile)).toBe(true);
  });

  test("a typed Profile exercising every R5 field validates", () => {
    const profile: Profile = {
      schema_version: "0.1.0",
      identity: { display_name: "T", neurotypes: ["dyspraxia"] },
      preferences: {
        output_format: "answer_first",
        line_height_hint: "relaxed",
        voice_input_preferred: true,
      },
      chronometric: {
        hyperfocus_break_minutes: 60,
        calendar_phase: "marking",
        weekday_overrides: {
          wednesday: { end_of_day_local: "18:30" },
          saturday: { hyperfocus_break_minutes: 120 },
        },
        protected_windows: [
          { start: "12:00", end: "12:30", label: "lunch" },
          { start: "17:00", end: "23:59" },
        ],
        deadline_cluster_awareness: true,
        time_buffer_multiplier: 1.3,
        motor_fatigue_aware: true,
      },
    };
    expect(validate(profile)).toBe(true);
  });
});
