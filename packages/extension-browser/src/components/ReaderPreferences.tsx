/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Reader preferences — the user's identity setting; shapes every translation.
 * Two variants: `lite` (onboarding: neurotypes + output shape) and `full`
 * (settings: adds max-items and free-text notes). Pure + controlled.
 */
import React from "react";
import type {
  ExtensionProfile,
  Neurotype,
  OutputFormat,
} from "../lib/types.js";

type ReaderPrefsValue = Pick<
  ExtensionProfile,
  "neurotypes" | "outputFormat" | "maxChunkSize" | "additionalNotes"
>;

const NEUROTYPES: ReadonlyArray<{
  value: Neurotype;
  label: string;
  hint: string;
}> = [
  { value: "adhd", label: "ADHD", hint: "answer-first, short lists" },
  {
    value: "asd",
    label: "Autism / ASD",
    hint: "literal, predictable structure",
  },
  { value: "audhd", label: "AuDHD", hint: "both, with the tension named" },
  { value: "ocd", label: "OCD", hint: "decisive, no open loops" },
  { value: "dyslexia", label: "Dyslexia", hint: "plain words, short lines" },
  { value: "dyspraxia", label: "Dyspraxia", hint: "clear steps, low clutter" },
  { value: "tourette", label: "Tourette's", hint: "calm, low-pressure tone" },
  { value: "other", label: "Other", hint: "tell us in the notes below" },
];

const OUTPUT_SHAPES: ReadonlyArray<{
  value: OutputFormat;
  label: string;
  hint: string;
}> = [
  {
    value: "answer_first",
    label: "Answer first",
    hint: "verdict in the first line",
  },
  {
    value: "conventional",
    label: "Conventional",
    hint: "brief context, then verdict",
  },
  {
    value: "bullet_first",
    label: "Bullet first",
    hint: "a list before any prose",
  },
];

interface ReaderPreferencesProps {
  readonly variant: "lite" | "full";
  readonly value: ReaderPrefsValue;
  readonly onChange: (patch: Partial<ReaderPrefsValue>) => void;
}

export function ReaderPreferences({
  variant,
  value,
  onChange,
}: ReaderPreferencesProps) {
  function toggleNeurotype(n: Neurotype) {
    const has = value.neurotypes.includes(n);
    const next = has
      ? value.neurotypes.filter((x) => x !== n)
      : [...value.neurotypes, n];
    onChange({ neurotypes: next });
  }

  return (
    <section className="nd-reader-prefs" aria-labelledby="reader-prefs-heading">
      <h3 id="reader-prefs-heading">How you read best</h3>
      <p className="nd-muted">
        This shapes every translation. Self-ID only — no diagnosis needed.
      </p>

      <fieldset
        data-testid="reader-prefs-neurotypes"
        className="nd-neurotype-grid"
      >
        <legend>Neurotype (optional)</legend>
        {NEUROTYPES.map((nt) => (
          <label key={nt.value} className="nd-checkbox">
            <input
              type="checkbox"
              data-testid={`reader-prefs-neurotype-${nt.value}`}
              checked={value.neurotypes.includes(nt.value)}
              onChange={() => toggleNeurotype(nt.value)}
            />
            <span>{nt.label}</span>
            <span className="nd-hint">{nt.hint}</span>
          </label>
        ))}
      </fieldset>

      <fieldset data-testid="reader-prefs-output-shape">
        <legend>Answer shape</legend>
        {OUTPUT_SHAPES.map((s) => (
          <label key={s.value} className="nd-radio">
            <input
              type="radio"
              name="reader-prefs-output"
              data-testid={`reader-prefs-output-${s.value}`}
              checked={value.outputFormat === s.value}
              onChange={() => onChange({ outputFormat: s.value })}
            />
            <span>{s.label}</span>
            <span className="nd-hint">{s.hint}</span>
          </label>
        ))}
      </fieldset>

      {variant === "full" && (
        <>
          <label className="nd-field">
            <span>Max items in a list</span>
            <input
              type="number"
              min={1}
              max={20}
              data-testid="reader-prefs-max-items"
              value={value.maxChunkSize}
              onChange={(e) =>
                onChange({
                  maxChunkSize: Math.min(
                    20,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                })
              }
            />
          </label>
          <label className="nd-field">
            <span>Anything else the AI should know?</span>
            <textarea
              data-testid="reader-prefs-notes"
              maxLength={500}
              value={value.additionalNotes ?? ""}
              onChange={(e) =>
                onChange({ additionalNotes: e.target.value || null })
              }
            />
          </label>
        </>
      )}
    </section>
  );
}
