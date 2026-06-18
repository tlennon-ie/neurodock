/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * neurotype-addenda.parity.test.ts — the TypeScript half of the cross-language
 * parity gate (ADR 0012 binding rule 2).
 *
 * The TypeScript assembler is the SOURCE OF TRUTH. This test asserts that the
 * TS assembler still produces the exact strings committed in
 * `data/neurotype-addenda/parity-fixtures.json`. The Python half
 * (`packages/mcp-translation/tests/test_addenda_parity.py`) asserts the Python
 * assembler produces the SAME strings. If TS and Python ever diverge, exactly
 * one of the two halves goes red — drift becomes a failed build, not a user
 * report.
 *
 * The fixture inputs (`cases`) live in the committed JSON so both runtimes read
 * byte-identical inputs. The `expected` strings are generated FROM this
 * assembler: run `UPDATE_NEUROTYPE_PARITY_FIXTURES=1 pnpm --filter @neurodock/core test`
 * to intentionally regenerate them after a deliberate artifact edit, then
 * re-run the Python half to confirm it still matches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  assembleNeurotypeAddendum,
  neurotypeAddendaV1,
  type AssembleNeurotypeAddendumOptions,
} from "./neurotype-addenda.js";

const FIXTURES_URL = new URL(
  "../data/neurotype-addenda/parity-fixtures.json",
  import.meta.url,
);
const FIXTURES_PATH = fileURLToPath(FIXTURES_URL);

/**
 * One parity case. Inputs use language-neutral snake_case keys so the
 * TypeScript and Python parity tests read byte-identical fixture inputs.
 */
interface ParityCase {
  readonly name: string;
  readonly tool?: string;
  readonly neurotypes: readonly string[];
  readonly output_format?: string;
  readonly max_chunk_size: number;
  readonly voice_input_preferred?: boolean;
  readonly additional_notes?: string | null;
  expected: string;
}

interface ParityFixtures {
  readonly description: string;
  readonly artifact_version: string;
  readonly cases: ParityCase[];
}

function optionsForCase(c: ParityCase): AssembleNeurotypeAddendumOptions {
  const options: {
    tool?: string;
    neurotypes: readonly string[];
    outputFormat?: string;
    maxChunkSize: number;
    voiceInputPreferred?: boolean;
    additionalNotes?: string | null;
  } = {
    neurotypes: c.neurotypes,
    maxChunkSize: c.max_chunk_size,
  };
  if (c.tool !== undefined) options.tool = c.tool;
  if (c.output_format !== undefined) options.outputFormat = c.output_format;
  if (c.voice_input_preferred !== undefined)
    options.voiceInputPreferred = c.voice_input_preferred;
  if (c.additional_notes !== undefined)
    options.additionalNotes = c.additional_notes;
  return options as AssembleNeurotypeAddendumOptions;
}

const fixtures = JSON.parse(
  readFileSync(FIXTURES_PATH, "utf-8"),
) as ParityFixtures;

describe("neurotype-addenda cross-language parity (TS source of truth)", () => {
  if (process.env.UPDATE_NEUROTYPE_PARITY_FIXTURES === "1") {
    test("regenerate parity fixtures from the TS assembler", () => {
      for (const c of fixtures.cases) {
        c.expected = assembleNeurotypeAddendum(
          neurotypeAddendaV1,
          optionsForCase(c),
        );
      }
      const regenerated: ParityFixtures = {
        ...fixtures,
        artifact_version: neurotypeAddendaV1.artifact_version,
      };
      writeFileSync(
        FIXTURES_PATH,
        JSON.stringify(regenerated, null, 2) + "\n",
        "utf-8",
      );
      expect(fixtures.cases.length).toBeGreaterThan(0);
    });
    return;
  }

  test("the fixture corpus is non-trivial and pinned to the shipped artifact", () => {
    // 59 cases exist; a floor of 55 catches accidental truncation of the corpus.
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(55);
    expect(fixtures.artifact_version).toBe(neurotypeAddendaV1.artifact_version);
  });

  test.each(fixtures.cases.map((c) => [c.name, c] as const))(
    "TS assembler reproduces fixture %s",
    (_name, c) => {
      expect(
        assembleNeurotypeAddendum(neurotypeAddendaV1, optionsForCase(c)),
      ).toBe(c.expected);
    },
  );
});
