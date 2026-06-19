/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * neurotype-addenda.ts — the shared, language-neutral assembler for
 * per-neurotype prompt shaping.
 *
 * This is the single source of truth (ADR 0012) for the per-(tool x
 * neurotype) response-tailoring blocks that NeuroDock surfaces append to a
 * model prompt. The content lives in `data/neurotype-addenda/v1.json`
 * (validated against `schemas/neurotype-addenda.schema.json`); this module
 * is the pure function that assembles those blocks into the final addendum
 * string.
 *
 * Design constraints:
 *   - Zero runtime dependencies. The artifact is plain JSON imported at
 *     build time; the assembler is pure TypeScript with no I/O.
 *   - ADR 0011 compliant: this is enum-keyed CONTENT, not schema shape. The
 *     artifact adds no field constraints and forks no schema.
 *   - The browser extension and (a later PR) the mcp-translation server both
 *     read this so per-neurotype shaping stays identical across surfaces.
 *
 * The ONLY interpolation tokens are `{max_chunk_size}` (replaced with the
 * caller's per-list item cap) and `{notes}` (replaced with the reader's
 * free-form notes inside the self-described block).
 */
import artifactV1 from "../data/neurotype-addenda/v1.json" with { type: "json" };

/** A prose block: ordered lines joined with the framing line separator. */
export type AddendumBlock = readonly string[];

/** The fusion (AuDHD substitution) rule. */
export interface AddendumFusion {
  readonly description?: string;
  readonly result: string;
  readonly any_of?: readonly string[];
  readonly all_of?: readonly string[];
  readonly remove?: readonly string[];
}

/** Wrapper, header, footer, separators, and conflict-footer copy. */
export interface AddendumFraming {
  readonly wrapper_prefix: string;
  readonly wrapper_suffix: string;
  readonly section_separator: string;
  readonly block_line_separator: string;
  readonly header: AddendumBlock;
  readonly footer: AddendumBlock;
  readonly conflict_footer_min_neurotypes: number;
  readonly conflict_footer: string;
}

/** Per-output-format guidance. */
export interface AddendumOutputFormat {
  readonly prefix: string;
  readonly separator: string;
  readonly descriptions: Readonly<Record<string, string>>;
  readonly default: string;
}

/** A single-block section (voice-input / tourette / other). */
export interface AddendumSingleBlock {
  readonly block: AddendumBlock;
}

/** The full artifact shape. Mirrors `schemas/neurotype-addenda.schema.json`. */
export interface NeurotypeAddendaArtifact {
  readonly artifact_version: string;
  readonly description?: string;
  readonly tokens?: readonly string[];
  readonly fusion: AddendumFusion;
  readonly priority: readonly string[];
  readonly framing: AddendumFraming;
  readonly output_format: AddendumOutputFormat;
  readonly voice_input: AddendumSingleBlock;
  readonly tourette: AddendumSingleBlock;
  readonly other: AddendumSingleBlock;
  readonly generic: Readonly<Record<string, AddendumBlock>>;
  readonly tools: Readonly<
    Record<string, Readonly<Record<string, AddendumBlock>>>
  >;
}

/**
 * The shipped v1 artifact, typed. Re-exported so consumers (the browser
 * extension, the mcp-translation server) bundle the canonical content
 * through `@neurodock/core` without re-reading the JSON file themselves.
 */
export const neurotypeAddendaV1: NeurotypeAddendaArtifact =
  artifactV1 as unknown as NeurotypeAddendaArtifact;

/** Inputs to {@link assembleNeurotypeAddendum}. */
export interface AssembleNeurotypeAddendumOptions {
  /**
   * The tool being shaped (e.g. `"translate_incoming"`). When provided and a
   * concrete per-tool block exists for a neurotype, that block is used;
   * otherwise the generic fallback block is used. When omitted, every
   * neurotype falls back to its generic block.
   */
  readonly tool?: string;
  /** The reader's self-identified neurotypes. */
  readonly neurotypes: readonly string[];
  /**
   * How the reader wants prose structured. Defaults to the artifact's
   * declared default when omitted.
   */
  readonly outputFormat?: string;
  /** Per-list item cap interpolated into `{max_chunk_size}` tokens. */
  readonly maxChunkSize: number;
  /** R5 cross-cutting voice-input hint. */
  readonly voiceInputPreferred?: boolean;
  /** Free-form reader notes interpolated into the `{notes}` token. */
  readonly additionalNotes?: string | null;
}

/**
 * Apply the artifact's fusion (AuDHD substitution) rule and de-duplicate.
 * Returns the neurotype list the addendum stack should iterate over.
 *
 * Reproduces the extension's `effectiveNeurotypes()`: when the input set
 * lists the fusion `result` directly, OR lists every neurotype in `all_of`,
 * the `result` is added and every neurotype in `remove` is dropped.
 */
function effectiveNeurotypes(
  artifact: NeurotypeAddendaArtifact,
  input: readonly string[],
): readonly string[] {
  const { fusion } = artifact;
  const set = new Set<string>(input);
  const hasResult = set.has(fusion.result);
  const hasAll =
    fusion.all_of !== undefined &&
    fusion.all_of.length > 0 &&
    fusion.all_of.every((n) => set.has(n));
  if (hasResult || hasAll) {
    set.add(fusion.result);
    for (const n of fusion.remove ?? []) {
      set.delete(n);
    }
  }
  return Array.from(set);
}

/**
 * Sort by the artifact's priority ordering. Higher-priority addenda are
 * placed LATER in the prompt (recency bias). Mirrors `orderByPriority()`.
 */
function orderByPriority(
  artifact: NeurotypeAddendaArtifact,
  neurotypes: readonly string[],
): readonly string[] {
  const { priority } = artifact;
  return [...neurotypes].sort(
    (a, b) => priority.indexOf(a) - priority.indexOf(b),
  );
}

/** Replace `{max_chunk_size}` in a single line. */
function interpolateMaxChunkSize(line: string, maxChunkSize: number): string {
  return line.split("{max_chunk_size}").join(String(maxChunkSize));
}

/** Render the output-format line. Mirrors `renderOutputFormatBlock()`. */
function renderOutputFormatBlock(
  artifact: NeurotypeAddendaArtifact,
  format: string,
): string {
  const { output_format } = artifact;
  const description = output_format.descriptions[format] ?? "";
  return output_format.prefix + format + output_format.separator + description;
}

/** Render the self-described block with `{notes}` interpolated. */
function renderOtherBlock(
  artifact: NeurotypeAddendaArtifact,
  notes: string,
): string {
  return artifact.other.block
    .map((line) => line.split("{notes}").join(notes))
    .join(artifact.framing.block_line_separator);
}

/**
 * Render the block for a single neurotype. Mirrors `renderNeurotypeBlock()`:
 *   - `tourette` -> the tourette special block;
 *   - `other`    -> the self-described block, or "" when there are no notes;
 *   - otherwise  -> the per-tool concrete block when one exists, else the
 *                   generic fallback block (both with `{max_chunk_size}`
 *                   interpolated).
 */
function renderNeurotypeBlock(
  artifact: NeurotypeAddendaArtifact,
  neurotype: string,
  maxChunkSize: number,
  additionalNotes: string | null,
  tool: string | undefined,
): string {
  const sep = artifact.framing.block_line_separator;

  if (neurotype === "tourette") {
    return artifact.tourette.block.join(sep);
  }

  if (neurotype === "other") {
    if (additionalNotes === null || additionalNotes.length === 0) {
      return "";
    }
    return renderOtherBlock(artifact, additionalNotes);
  }

  let block: AddendumBlock | undefined;
  if (tool !== undefined) {
    const matrix = artifact.tools[tool];
    block = matrix ? matrix[neurotype] : undefined;
  }
  if (block === undefined) {
    block = artifact.generic[neurotype];
  }
  if (block === undefined) {
    return "";
  }
  return block
    .map((line) => interpolateMaxChunkSize(line, maxChunkSize))
    .join(sep);
}

/**
 * Assemble the per-neurotype prompt addendum from the artifact.
 *
 * Pure function: deterministic, no I/O, no mutation of inputs. Reproduces
 * the assembly the NeuroDock browser extension shipped (fusion -> priority
 * order -> per-tool blocks with generic fallback -> tourette/other specials
 * -> voice-input cross-cutting block -> conflict footer -> token
 * interpolation) so per-neurotype shaping is byte-identical across surfaces.
 *
 * Returns "" when there are no effective neurotypes, no notes, a default
 * output format, AND no voice-input hint — i.e. the all-default case stays
 * byte-identical to an un-shaped prompt.
 */
export function assembleNeurotypeAddendum(
  artifact: NeurotypeAddendaArtifact,
  options: AssembleNeurotypeAddendumOptions,
): string {
  const {
    tool,
    neurotypes,
    maxChunkSize,
    voiceInputPreferred,
    additionalNotes = null,
  } = options;
  const outputFormat = options.outputFormat ?? artifact.output_format.default;

  const effective = effectiveNeurotypes(artifact, neurotypes);
  const hasNotes = additionalNotes !== null && additionalNotes.length > 0;
  const hasNonDefaultFormat = outputFormat !== artifact.output_format.default;
  const wantsVoiceInput = voiceInputPreferred === true;

  if (
    effective.length === 0 &&
    !hasNotes &&
    !hasNonDefaultFormat &&
    !wantsVoiceInput
  ) {
    return "";
  }

  const { framing } = artifact;
  const sections: string[] = [];
  for (const line of framing.header) {
    sections.push(line);
  }
  sections.push(renderOutputFormatBlock(artifact, outputFormat));

  if (wantsVoiceInput) {
    sections.push("");
    sections.push(
      artifact.voice_input.block.join(framing.block_line_separator),
    );
  }

  const ordered = orderByPriority(artifact, effective);
  for (const neurotype of ordered) {
    const block = renderNeurotypeBlock(
      artifact,
      neurotype,
      maxChunkSize,
      additionalNotes,
      tool,
    );
    if (block.length > 0) {
      sections.push("");
      sections.push(block);
    }
  }

  if (hasNotes && !ordered.includes("other")) {
    sections.push("");
    sections.push(renderOtherBlock(artifact, additionalNotes ?? ""));
  }

  if (ordered.length >= framing.conflict_footer_min_neurotypes) {
    sections.push("");
    sections.push(framing.conflict_footer);
  }

  for (const line of framing.footer) {
    sections.push(line);
  }

  return (
    framing.wrapper_prefix +
    sections.join(framing.section_separator) +
    framing.wrapper_suffix
  );
}
