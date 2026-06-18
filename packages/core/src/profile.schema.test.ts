/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * profile.schema.test.ts — schema-conformance gate for the NeuroDock profile.
 *
 * Compiles the canonical schema (the exact file shipped in the package and
 * consumed at runtime by @neurodock/cli, the extension, and the native host)
 * with Ajv 2020 and asserts:
 *   - the worked example + minimal templates validate clean (they are part of
 *     the contract per ADR 0004);
 *   - every R5 optional field (ADR 0011) validates when present, is valid when
 *     omitted, and is rejected on a malformed value;
 *   - a v0.1.0 profile carrying NONE of the new fields still validates
 *     (backward-compat — the central correctness property of ADR 0004).
 *
 * Ajv + ajv-formats + yaml are dev-only test dependencies. The package keeps
 * its zero-runtime-dependencies invariant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { beforeAll, describe, expect, test } from "vitest";
import type { ValidateFunction } from "ajv";
import { buildAjv } from "./test-helpers/ajv.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(here, "..", "schemas");

function readSchema(): object {
  const raw = readFileSync(resolve(schemasDir, "profile.schema.json"), "utf8");
  return JSON.parse(raw) as object;
}

function readYaml(name: string): unknown {
  return parseYaml(readFileSync(resolve(schemasDir, name), "utf8"));
}

let validate: ValidateFunction;

beforeAll(() => {
  validate = buildAjv().compile(readSchema());
});

const BASE_IDENTITY = {
  identity: { display_name: "T", neurotypes: ["adhd"] },
} as const;

describe("profile schema — shipped templates", () => {
  test("the worked example validates clean", () => {
    expect(validate(readYaml("profile.example.yaml"))).toBe(true);
  });

  test("the minimal template validates clean", () => {
    expect(validate(readYaml("profile.minimal.yaml"))).toBe(true);
  });
});

describe("profile schema — backward compatibility (ADR 0004)", () => {
  test("a v0.1.0 profile carrying NONE of the R5 fields still validates", () => {
    const legacy = {
      schema_version: "0.1.0",
      identity: { display_name: "T", neurotypes: ["adhd", "asd"] },
      preferences: {
        output_format: "answer_first",
        max_chunk_size: 5,
        reading_font_hint: "atkinson_hyperlegible",
        motion: "reduced",
      },
      chronometric: {
        hyperfocus_break_minutes: 90,
        end_of_day_local: "18:30",
        session_overlap_policy: "auto_close",
      },
      guardrails: {
        rumination_threshold: 3,
        rumination_window_minutes: 90,
        sycophancy_check: "warn",
      },
      privacy: {
        embeddings: "local",
        telemetry: "off",
        os_idle_consent: false,
      },
    };
    expect(validate(legacy)).toBe(true);
  });

  test("the bare minimal profile (identity only) is still valid", () => {
    expect(validate({ ...BASE_IDENTITY })).toBe(true);
  });
});

describe("preferences.line_height_hint (R5)", () => {
  test.each(["compact", "default", "relaxed"])(
    "accepts the enum value %s",
    (value) => {
      expect(
        validate({
          ...BASE_IDENTITY,
          preferences: { line_height_hint: value },
        }),
      ).toBe(true);
    },
  );

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, preferences: {} })).toBe(true);
  });

  test("rejects a value outside the enum", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        preferences: { line_height_hint: "double" },
      }),
    ).toBe(false);
  });
});

describe("preferences.voice_input_preferred (R5)", () => {
  test("accepts true", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        preferences: { voice_input_preferred: true },
      }),
    ).toBe(true);
  });

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, preferences: {} })).toBe(true);
  });

  test("rejects a non-boolean", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        preferences: { voice_input_preferred: "yes" },
      }),
    ).toBe(false);
  });
});

describe("chronometric.calendar_phase (R5)", () => {
  test.each(["teaching", "marking", "exam", "deadlines", "break"])(
    "accepts the enum value %s",
    (value) => {
      expect(
        validate({ ...BASE_IDENTITY, chronometric: { calendar_phase: value } }),
      ).toBe(true);
    },
  );

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, chronometric: {} })).toBe(true);
  });

  test("rejects a value outside the enum", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { calendar_phase: "summer" },
      }),
    ).toBe(false);
  });
});

describe("chronometric.weekday_overrides (R5)", () => {
  test("accepts per-weekday overrides reusing the existing patterns/ranges", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: {
          weekday_overrides: {
            wednesday: { end_of_day_local: "18:30" },
            saturday: { hyperfocus_break_minutes: 120 },
            monday: {
              end_of_day_local: "17:00",
              hyperfocus_break_minutes: 60,
            },
          },
        },
      }),
    ).toBe(true);
  });

  test("accepts an empty override object for a weekday", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { weekday_overrides: { friday: {} } },
      }),
    ).toBe(true);
  });

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, chronometric: {} })).toBe(true);
  });

  test("rejects an unknown weekday key", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { weekday_overrides: { funday: {} } },
      }),
    ).toBe(false);
  });

  test("rejects a malformed end_of_day_local inside an override", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: {
          weekday_overrides: { monday: { end_of_day_local: "25:00" } },
        },
      }),
    ).toBe(false);
  });

  test("rejects an out-of-range hyperfocus_break_minutes inside an override", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: {
          weekday_overrides: { monday: { hyperfocus_break_minutes: 5 } },
        },
      }),
    ).toBe(false);
  });

  test("rejects an unknown key inside an override object", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { weekday_overrides: { monday: { lunch: "12:00" } } },
      }),
    ).toBe(false);
  });
});

describe("chronometric.protected_windows (R5)", () => {
  test("accepts a list of local-time ranges with optional labels", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: {
          protected_windows: [
            { start: "12:00", end: "12:30", label: "lunch" },
            { start: "17:00", end: "23:59" },
          ],
        },
      }),
    ).toBe(true);
  });

  test("accepts an empty list", () => {
    expect(
      validate({ ...BASE_IDENTITY, chronometric: { protected_windows: [] } }),
    ).toBe(true);
  });

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, chronometric: {} })).toBe(true);
  });

  test("rejects a window missing the required end", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { protected_windows: [{ start: "12:00" }] },
      }),
    ).toBe(false);
  });

  test("rejects a malformed time string", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { protected_windows: [{ start: "9am", end: "10am" }] },
      }),
    ).toBe(false);
  });

  test("rejects an unknown key inside a window object", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: {
          protected_windows: [{ start: "12:00", end: "12:30", color: "red" }],
        },
      }),
    ).toBe(false);
  });
});

describe("chronometric.deadline_cluster_awareness (R5)", () => {
  test("accepts true", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { deadline_cluster_awareness: true },
      }),
    ).toBe(true);
  });

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, chronometric: {} })).toBe(true);
  });

  test("rejects a non-boolean", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { deadline_cluster_awareness: "yes" },
      }),
    ).toBe(false);
  });
});

describe("chronometric.time_buffer_multiplier (R5)", () => {
  test.each([1.0, 1.3, 3.0])("accepts the multiplier %s", (value) => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { time_buffer_multiplier: value },
      }),
    ).toBe(true);
  });

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, chronometric: {} })).toBe(true);
  });

  test("rejects a multiplier below the minimum", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { time_buffer_multiplier: 0.5 },
      }),
    ).toBe(false);
  });

  test("rejects a multiplier above the maximum", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { time_buffer_multiplier: 4 },
      }),
    ).toBe(false);
  });
});

describe("chronometric.motor_fatigue_aware (R5)", () => {
  test("accepts true", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { motor_fatigue_aware: true },
      }),
    ).toBe(true);
  });

  test("is valid when omitted", () => {
    expect(validate({ ...BASE_IDENTITY, chronometric: {} })).toBe(true);
  });

  test("rejects a non-boolean", () => {
    expect(
      validate({
        ...BASE_IDENTITY,
        chronometric: { motor_fatigue_aware: 1 },
      }),
    ).toBe(false);
  });
});
