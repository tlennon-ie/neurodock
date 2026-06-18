/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * neurotype-addendum-byte-identical.test.ts — the load-bearing regression
 * gate for R1 part A (the shared neurotype-shaping artifact).
 *
 * This asserts that the output of the extension's `buildNeurotypeAddendum`
 * is BYTE-FOR-BYTE identical to the output of `@neurodock/core`'s
 * `assembleNeurotypeAddendum(neurotypeAddendaV1, ...)` across the full
 * cross-product of:
 *   - all five tools the extension shapes (+ the no-tool overload),
 *   - representative neurotype combinations (every single neurotype, the
 *     adhd+asd -> audhd fusion, explicit audhd, a 3+ multi-type, empty),
 *   - max_chunk_size variants,
 *   - voice_input_preferred true / false / unset,
 *   - output_format variants,
 *   - additional_notes present / absent.
 *
 * It is written and proven GREEN while `buildNeurotypeAddendum` is still the
 * hardcoded implementation — that proves the artifact + assembler reproduce
 * the shipped behaviour exactly. After the cutover (delegating
 * `buildNeurotypeAddendum` to the core assembler) it stays GREEN, which is
 * how "zero behaviour change" is proven mechanically rather than by eye.
 */
import { describe, expect, test } from "vitest";
import { assembleNeurotypeAddendum, neurotypeAddendaV1 } from "@neurodock/core";
import { buildNeurotypeAddendum } from "../../src/lib/neurotype-addendum.js";
import type {
  ExtensionProfile,
  Neurotype,
  OutputFormat,
  TranslationTool,
} from "../../src/lib/types.js";

function profile(overrides: Partial<ExtensionProfile> = {}): ExtensionProfile {
  return {
    mode: "local",
    localProvider: "ollama",
    localEndpoint: "http://localhost:11434",
    localModel: "llama3.2:3b",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    cloudApiKeys: {},
    historyEnabled: false,
    displayName: "you",
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  };
}

const TOOLS: readonly (TranslationTool | undefined)[] = [
  undefined,
  "translate_incoming",
  "check_tone",
  "rewrite_outgoing",
  "brief_meeting",
  "describe_image",
];

const NEUROTYPE_COMBINATIONS: readonly (readonly Neurotype[])[] = [
  [],
  ["adhd"],
  ["asd"],
  ["audhd"],
  ["ocd"],
  ["dyslexia"],
  ["dyspraxia"],
  ["tourette"],
  ["other"],
  ["adhd", "asd"], // fusion -> audhd
  ["adhd", "asd", "ocd"], // fusion + a third => 2 effective, footer NOT triggered
  ["adhd", "dyslexia", "ocd"], // 3+ effective -> conflict footer
  ["tourette", "adhd", "asd"], // tourette + fusion
  ["adhd", "other"], // other always last
  ["tourette", "dyspraxia", "dyslexia", "ocd", "asd", "adhd", "other"], // everything
];

const MAX_CHUNK_SIZES: readonly number[] = [1, 3, 5, 20];

const OUTPUT_FORMATS: readonly OutputFormat[] = [
  "answer_first",
  "conventional",
  "bullet_first",
];

const VOICE_INPUT_VARIANTS: readonly (boolean | undefined)[] = [
  undefined,
  false,
  true,
];

const NOTES_VARIANTS: readonly (string | null)[] = [
  null,
  "",
  "Please always quote the source verbatim. Use kelvin, not celsius.",
];

/** Map an ExtensionProfile + tool to the core assembler's options. */
function toAssemblerOptions(
  p: ExtensionProfile,
  tool: TranslationTool | undefined,
): Parameters<typeof assembleNeurotypeAddendum>[1] {
  return {
    tool,
    neurotypes: p.neurotypes,
    outputFormat: p.outputFormat,
    maxChunkSize: p.maxChunkSize,
    voiceInputPreferred: p.voiceInputPreferred,
    additionalNotes: p.additionalNotes,
  };
}

describe("buildNeurotypeAddendum is byte-identical to the core assembler", () => {
  // Enumerate the full cross-product. Each case asserts strict string
  // equality; any single divergent byte fails the suite.
  for (const tool of TOOLS) {
    for (const neurotypes of NEUROTYPE_COMBINATIONS) {
      for (const maxChunkSize of MAX_CHUNK_SIZES) {
        for (const outputFormat of OUTPUT_FORMATS) {
          for (const voiceInputPreferred of VOICE_INPUT_VARIANTS) {
            for (const additionalNotes of NOTES_VARIANTS) {
              const label =
                `tool=${tool ?? "none"} ` +
                `nt=[${neurotypes.join(",")}] ` +
                `max=${maxChunkSize} ` +
                `fmt=${outputFormat} ` +
                `voice=${String(voiceInputPreferred)} ` +
                `notes=${
                  additionalNotes === null
                    ? "null"
                    : `"${additionalNotes.length}"`
                }`;
              test(label, () => {
                const p = profile({
                  neurotypes,
                  maxChunkSize,
                  outputFormat,
                  voiceInputPreferred,
                  additionalNotes,
                });
                const fromExtension = buildNeurotypeAddendum(p, tool);
                const fromCore = assembleNeurotypeAddendum(
                  neurotypeAddendaV1,
                  toAssemblerOptions(p, tool),
                );
                expect(fromCore).toBe(fromExtension);
              });
            }
          }
        }
      }
    }
  }
});
