/**
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * 0.0.31 regression — ImageDescribeView must render the v0.2.0
 * `content_translation` field as the PRIMARY surface and demote the
 * legacy `description` / `inferred_purpose` / `key_elements` /
 * `transcribed_text` / `accessibility_notes` fields into a closed
 * "Accessibility metadata" collapsible. Before 0.0.31, the view read
 * only the legacy fields and silently dropped `content_translation`
 * even though 0.0.30 shipped the schema + prompt to require it.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolView } from "../../entrypoints/_shared/panel.js";

function legacyOnlyData(): Record<string, unknown> {
  return {
    description: "A documentation page from Harness.",
    contains_text: true,
    transcribed_text: "1. Use Cases\nDecouple Deployment from Release\n…",
    key_elements: ["heading 1. Use Cases", "code block", "Harness logo"],
    inferred_purpose: "Explain when feature flags add value.",
    accessibility_notes: "Documentation page screenshot from Harness.",
    eval_corpus_slice: "describe_image-v0.2.0",
    model_provenance: {
      mode: "local",
      provider: "lmstudio",
      model: "gemma-4-e4b",
    },
  };
}

function harnessTranslation(): unknown {
  return [
    {
      label: "1. Use Cases (section heading)",
      facets: [
        {
          kind: "context",
          text: "This section lists situations where feature flags add value.",
        },
        {
          kind: "goal",
          text: "Decide whether your team has at least one of these situations.",
        },
      ],
    },
    {
      label: "Decouple Deployment from Release",
      facets: [
        {
          kind: "input",
          text: "You have code ready to deploy but it is not ready for users yet.",
        },
        {
          kind: "action",
          text: "Deploy the code behind a flag set to 'off' for everyone.",
        },
        {
          kind: "goal",
          text: "Release is now a config change, not a deploy.",
        },
      ],
    },
  ];
}

describe("ImageDescribeView — content_translation rendering", () => {
  it("renders content_translation entries as the primary surface when populated", () => {
    const data = {
      ...legacyOnlyData(),
      content_translation: harnessTranslation(),
    };
    render(<ToolView tool="describe_image" data={data} />);

    // Primary surface is the content_translation list.
    expect(screen.getByTestId("content-translation-list")).toBeInTheDocument();
    expect(screen.getAllByTestId("content-translation-entry")).toHaveLength(2);

    // Both labels render verbatim.
    expect(
      screen.getByText("1. Use Cases (section heading)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Decouple Deployment from Release"),
    ).toBeInTheDocument();

    // Facet text and sentence-case kind chip both appear. Visual identity
    // refresh removed ALL CAPS labels per the design contract; the chips
    // now read "Input", "Action", "Goal", "Context".
    expect(
      screen.getByText(
        "You have code ready to deploy but it is not ready for users yet.",
      ),
    ).toBeInTheDocument();
    const kindChips = screen.getAllByTestId("content-translation-facet-kind");
    const labels = kindChips.map((el) => el.textContent);
    expect(labels).toContain("Input");
    expect(labels).toContain("Action");
    expect(labels).toContain("Goal");
    expect(labels).toContain("Context");
  });

  it("demotes legacy fields into a closed-by-default Accessibility metadata collapsible", () => {
    const data = {
      ...legacyOnlyData(),
      content_translation: harnessTranslation(),
    };
    render(<ToolView tool="describe_image" data={data} />);

    // Legacy text must NOT be in the visible DOM tree until the user
    // expands the metadata collapsible.
    expect(screen.queryByText("A documentation page from Harness.")).toBeNull();

    // Open the collapsible and confirm the legacy fields are present.
    fireEvent.click(
      screen.getByRole("button", { name: /accessibility metadata/i }),
    );
    expect(
      screen.getByText("A documentation page from Harness."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Explain when feature flags add value."),
    ).toBeInTheDocument();
  });

  it("falls back to the legacy primary layout when content_translation is null (decorative)", () => {
    const data = { ...legacyOnlyData(), content_translation: null };
    render(<ToolView tool="describe_image" data={data} />);

    expect(screen.queryByTestId("content-translation-list")).toBeNull();
    // Legacy description is the primary surface again (TldrCard).
    expect(
      screen.getByText("A documentation page from Harness."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Explain when feature flags add value."),
    ).toBeInTheDocument();
  });

  it("falls back to legacy layout when content_translation field is omitted entirely (v0.1.x)", () => {
    const data = legacyOnlyData();
    render(<ToolView tool="describe_image" data={data} />);

    expect(screen.queryByTestId("content-translation-list")).toBeNull();
    expect(
      screen.getByText("A documentation page from Harness."),
    ).toBeInTheDocument();
  });

  it("treats an empty content_translation array as null and renders legacy primary", () => {
    // Post-0.0.30 the schema rejects []; but if a legacy or
    // out-of-spec response slips through, the panel still degrades to
    // the legacy primary layout rather than rendering an empty box.
    const data = { ...legacyOnlyData(), content_translation: [] };
    render(<ToolView tool="describe_image" data={data} />);

    expect(screen.queryByTestId("content-translation-list")).toBeNull();
    expect(
      screen.getByText("A documentation page from Harness."),
    ).toBeInTheDocument();
  });

  it("treats unknown facet kinds as `context` per forward-compat rule", () => {
    const data = {
      ...legacyOnlyData(),
      content_translation: [
        {
          label: "Future kind",
          facets: [{ kind: "made_up_kind_v3", text: "A new facet text." }],
        },
      ],
    };
    render(<ToolView tool="describe_image" data={data} />);
    const kindChip = screen.getByTestId("content-translation-facet-kind");
    // Sentence case per the visual-identity refresh — the chip renders
    // `Context` (label, no ALL CAPS) rather than the raw enum value.
    expect(kindChip.textContent).toBe("Context");
    expect(screen.getByText("A new facet text.")).toBeInTheDocument();
  });
});
