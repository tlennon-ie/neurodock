/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Per-tool per-neurotype prompt addenda — extension adapter.
 *
 * The per-(tool x neurotype) shaping content + the assembly rules now live
 * in `@neurodock/core` as a single language-neutral artifact
 * (`data/neurotype-addenda/v1.json`, validated against
 * `schemas/neurotype-addenda.schema.json`) plus the pure
 * `assembleNeurotypeAddendum` function (ADR 0012). The mcp-translation
 * server reads the same artifact so per-neurotype shaping is identical
 * across surfaces.
 *
 * Before R1, this module hard-coded every block inline. Those blocks were
 * transcribed VERBATIM into the core artifact, and the cutover is guarded by
 * `tests/unit/neurotype-addendum-byte-identical.test.ts`, which asserts the
 * output here is byte-for-byte identical to the core assembler across the
 * full cross-product of tools, neurotype combinations, chunk sizes, output
 * formats, voice-input states, and notes. So this is a pure refactor with
 * zero behaviour change.
 *
 * This file is now a thin adapter: it maps the extension's `ExtensionProfile`
 * shape onto the core assembler's options. Its public signature is unchanged
 * (`buildNeurotypeAddendum(profile, tool?)`) so prompt-builder.ts and the
 * existing test suite are untouched.
 *
 * Combination rules (unchanged, now data-driven in the artifact):
 *   - `adhd` + `asd` -> substitute the fused AuDHD block.
 *   - Profile listing `audhd` directly -> use the AuDHD block.
 *   - 3+ neurotypes -> concatenate + conflict-resolution footer.
 *   - `other` always last so user-authored notes are the final word.
 */
import { assembleNeurotypeAddendum, neurotypeAddendaV1 } from "@neurodock/core";
import type { ExtensionProfile, TranslationTool } from "./types.js";

/**
 * Build the addendum string. When `tool` is provided, dispatch to the
 * per-tool per-neurotype blocks; otherwise fall back to the generic blocks
 * (kept for back-compat with callers that haven't been updated, and for the
 * `additional_notes` / output_format-only case).
 *
 * Returns "" when the profile has no neurotypes, no additional_notes, uses
 * the default output_format, AND does not request voice-input shaping — i.e.
 * the all-default case stays byte-identical to the un-shaped prompt so
 * existing test snapshots and behaviour are preserved.
 *
 * Delegates to `@neurodock/core`'s `assembleNeurotypeAddendum`, the single
 * source of truth shared with the mcp-translation server.
 */
export function buildNeurotypeAddendum(
  profile: ExtensionProfile,
  tool?: TranslationTool,
): string {
  return assembleNeurotypeAddendum(neurotypeAddendaV1, {
    tool,
    neurotypes: profile.neurotypes,
    outputFormat: profile.outputFormat,
    maxChunkSize: profile.maxChunkSize,
    voiceInputPreferred: profile.voiceInputPreferred,
    additionalNotes: profile.additionalNotes,
  });
}
