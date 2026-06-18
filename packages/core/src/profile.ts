/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * profile.ts — the canonical TypeScript shape of a NeuroDock profile.
 *
 * Derived by hand from `schemas/profile.schema.json` and linked to it by the
 * runtime-assertion test in `profile.test.ts`, which validates representative
 * typed fixtures against the Ajv-compiled schema so the two cannot drift.
 *
 * ADR 0004 says shared types SHOULD be derived from the schema. We deliberately
 * hand-write this type and close the drift loop with the runtime schema-assertion
 * test above, rather than running a codegen step: it keeps `@neurodock/core`'s
 * build a plain `tsc` with zero codegen tooling and zero runtime deps, and the
 * surface is small enough that the assertion test is a cheaper, equally reliable
 * guard. This is an intentional choice, not an oversight.
 *
 * Forward-compat (ADR 0004): unknown keys are allowed at every object level,
 * so each interface carries an index signature. Every field below `identity`
 * is optional; defaults are loader-applied, never written into the file.
 *
 * Additive-only (ADR 0005 / ADR 0011): the R5 tailoring fields are OPTIONAL
 * and additive. They are never required and never narrow an existing type.
 */

/** Self-identified neurotype tags. Self-ID is sufficient; never a diagnosis. */
export type Neurotype =
  | "adhd"
  | "asd"
  | "audhd"
  | "ocd"
  | "dyslexia"
  | "dyspraxia"
  | "tourette"
  | "other";

export type OutputFormat = "answer_first" | "conventional" | "bullet_first";
export type ReadingFontHint =
  | "atkinson_hyperlegible"
  | "lexend"
  | "system_default";
export type Motion = "reduced" | "system" | "full";

/** R5 (ADR 0011): categorical line-height band for rich-text clients. */
export type LineHeightHint = "compact" | "default" | "relaxed";

export type SessionOverlapPolicy = "auto_close" | "error";

/** R5 (ADR 0011): self-declared term/semester phase. */
export type CalendarPhase =
  | "teaching"
  | "marking"
  | "exam"
  | "deadlines"
  | "break";

export type SycophancyCheck = "off" | "warn" | "refuse";
export type Embeddings = "local" | "cloud_voyage" | "cloud_openai";
export type Telemetry = "off" | "local_otel_only" | "full";

/** Lowercase English weekday names — the keys of `weekday_overrides`. */
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface ProfileIdentity {
  display_name: string;
  neurotypes: Neurotype[];
  additional_notes?: string;
  [key: string]: unknown;
}

export interface ProfilePreferences {
  output_format?: OutputFormat;
  max_chunk_size?: number;
  reading_font_hint?: ReadingFontHint;
  motion?: Motion;
  /** R5 (ADR 0011): optional rich-text line-height hint. */
  line_height_hint?: LineHeightHint;
  /** R5 (ADR 0011): true when the user predominantly dictates input. */
  voice_input_preferred?: boolean;
  [key: string]: unknown;
}

/**
 * R5 (ADR 0011): per-weekday override of the day-varying chronometric fields.
 *
 * Intentionally NO `[key: string]: unknown` index signature, unlike the other
 * interfaces in this file. This corresponds to the `weekdayOverride` `$def`,
 * which sets `additionalProperties: false` as a deliberate typo-guard (a
 * misspelt key here is almost always a mistake that would silently do nothing).
 * Omitting the index signature mirrors that closed shape in the type; do NOT
 * "fix" it by adding one — the schema would then reject what the type permits.
 */
export interface WeekdayOverride {
  end_of_day_local?: string;
  hyperfocus_break_minutes?: number;
}

/**
 * R5 (ADR 0011): a local-time range the hyperfocus monitor hard-surfaces in.
 *
 * Intentionally NO `[key: string]: unknown` index signature, unlike the other
 * interfaces in this file. This corresponds to the `protectedWindow` `$def`,
 * which sets `additionalProperties: false` as a deliberate typo-guard for its
 * small, fixed shape. Omitting the index signature mirrors that closed shape;
 * do NOT "fix" it by adding one — the schema would then reject what the type
 * permits.
 */
export interface ProtectedWindow {
  start: string;
  end: string;
  label?: string;
}

export interface ProfileChronometric {
  hyperfocus_break_minutes?: number;
  end_of_day_local?: string;
  zones?: Record<string, unknown>;
  session_overlap_policy?: SessionOverlapPolicy;
  /** R5 (ADR 0011): self-declared term/semester phase. */
  calendar_phase?: CalendarPhase;
  /** R5 (ADR 0011): per-weekday overrides; absent weekdays inherit top-level. */
  weekday_overrides?: Partial<Record<Weekday, WeekdayOverride>>;
  /** R5 (ADR 0011): windows where the monitor hard-surfaces rather than nudges. */
  protected_windows?: ProtectedWindow[];
  /** R5 (ADR 0011): surface deadline proximity in planning skills. */
  deadline_cluster_awareness?: boolean;
  /** R5 (ADR 0011): pad presented time estimates (1.0..3.0; neutral 1.0). */
  time_buffer_multiplier?: number;
  /** R5 (ADR 0011): weight motor activity into the fatigue signal. */
  motor_fatigue_aware?: boolean;
  [key: string]: unknown;
}

export interface ProfileGuardrails {
  rumination_threshold?: number;
  rumination_window_minutes?: number;
  sycophancy_check?: SycophancyCheck;
  [key: string]: unknown;
}

export interface ProfilePrivacy {
  embeddings?: Embeddings;
  telemetry?: Telemetry;
  os_idle_consent?: boolean;
  [key: string]: unknown;
}

/**
 * A NeuroDock profile. `identity` is the only required block; every other
 * block is optional and defaulted by the loader at read time (ADR 0004).
 */
export interface Profile {
  schema_version?: string;
  extends?: string;
  identity: ProfileIdentity;
  preferences?: ProfilePreferences;
  chronometric?: ProfileChronometric;
  guardrails?: ProfileGuardrails;
  privacy?: ProfilePrivacy;
  [key: string]: unknown;
}
