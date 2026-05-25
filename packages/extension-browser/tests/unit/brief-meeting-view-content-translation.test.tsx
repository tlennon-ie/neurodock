/**
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * 0.0.31 regression — BriefMeetingView must render the v0.2.0
 * `content_translation` field as the PRIMARY surface and demote the
 * legacy four-section extraction (my_asks / others_asks / decisions /
 * ambiguous_items) into a closed "Meeting transcript metadata"
 * collapsible. Before 0.0.31, the view read only the legacy four
 * sections.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolView } from "../../entrypoints/_shared/panel.js";

function legacyOnlyData(): Record<string, unknown> {
  return {
    my_asks: [
      {
        text: "Own the migration script by Friday.",
        asker: "Priya",
        due: "Friday",
        quoted_span: {
          text: "Tom, can you own the migration script by Friday?",
        },
      },
    ],
    others_asks: [
      {
        text: "Get sign-off from Legal.",
        asker: "Tom",
        due: null,
        quoted_span: { text: "We need sign-off from Legal." },
      },
    ],
    decisions: [
      {
        text: "Ship behind a feature flag.",
        decided_by: ["Priya", "Tom"],
        quoted_span: { text: "Agreed — feature flag it." },
      },
    ],
    ambiguous_items: [
      {
        text: "Who pages on-call this weekend?",
        reason: "unassigned_owner",
        quoted_span: { text: "Someone should page on-call." },
      },
    ],
    eval_corpus_slice: "brief_meeting-v0.2.0",
    model_provenance: {
      mode: "local",
      provider: "lmstudio",
      model: "gemma-4-e4b",
    },
  };
}

function meetingTranslation(): unknown {
  return [
    {
      label: "my_asks[0]: own the migration script",
      facets: [
        { kind: "input", text: "Priya asked you to own the migration script." },
        { kind: "action", text: "Block out 2 hours this week to write it." },
        { kind: "goal", text: "Script ready and reviewed by Friday." },
      ],
    },
    {
      label: "decisions[0]: ship behind a feature flag",
      facets: [
        {
          kind: "fact",
          text: "The team agreed to ship behind a feature flag.",
        },
        { kind: "rule", text: "All new behaviour is wrapped in a flag check." },
      ],
    },
  ];
}

describe("BriefMeetingView — content_translation rendering", () => {
  it("renders content_translation entries as the primary surface when populated", () => {
    const data = {
      ...legacyOnlyData(),
      content_translation: meetingTranslation(),
    };
    render(<ToolView tool="brief_meeting" data={data} />);

    expect(screen.getByTestId("content-translation-list")).toBeInTheDocument();
    expect(screen.getAllByTestId("content-translation-entry")).toHaveLength(2);

    expect(
      screen.getByText("my_asks[0]: own the migration script"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("decisions[0]: ship behind a feature flag"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Block out 2 hours this week to write it."),
    ).toBeInTheDocument();

    const kindChips = screen.getAllByTestId("content-translation-facet-kind");
    const labels = kindChips.map((el) => el.textContent);
    expect(labels).toContain("INPUT");
    expect(labels).toContain("ACTION");
    expect(labels).toContain("GOAL");
    expect(labels).toContain("FACT");
    expect(labels).toContain("RULE");
  });

  it("demotes legacy four-section extraction into a closed Meeting transcript metadata collapsible", () => {
    const data = {
      ...legacyOnlyData(),
      content_translation: meetingTranslation(),
    };
    render(<ToolView tool="brief_meeting" data={data} />);

    // Legacy quoted text NOT visible before user expands.
    expect(
      screen.queryByText("Tom, can you own the migration script by Friday?"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /meeting transcript metadata/i }),
    );
    expect(
      screen.getByText("Tom, can you own the migration script by Friday?"),
    ).toBeInTheDocument();
    // Legacy decisions list renders "{text} (by {decided_by})" across
    // sibling text nodes, so use a textContent matcher rather than
    // whole-node equality.
    expect(
      screen.getByText(
        (_content, node) =>
          node !== null &&
          (node.textContent ?? "").includes("Ship behind a feature flag.") &&
          node.tagName.toLowerCase() === "li",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to legacy four-section layout when content_translation is null (chat-only)", () => {
    const data = { ...legacyOnlyData(), content_translation: null };
    render(<ToolView tool="brief_meeting" data={data} />);

    expect(screen.queryByTestId("content-translation-list")).toBeNull();
    // Legacy section headings are the primary surface again.
    expect(screen.getByText("Asks on me")).toBeInTheDocument();
    // Legacy AskList splits the text across child text nodes (text +
    // " — from {asker}" + " (due {due})") so use a text-content
    // matcher rather than the default whole-node equality.
    expect(
      screen.getByText(
        (_content, node) =>
          node !== null &&
          (node.textContent ?? "").includes(
            "Own the migration script by Friday.",
          ) &&
          node.tagName.toLowerCase() === "li",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to legacy layout when content_translation field is omitted entirely (v0.1.x)", () => {
    const data = legacyOnlyData();
    render(<ToolView tool="brief_meeting" data={data} />);

    expect(screen.queryByTestId("content-translation-list")).toBeNull();
    expect(screen.getByText("Asks on me")).toBeInTheDocument();
  });

  it("treats an empty content_translation array as null and renders legacy primary", () => {
    const data = { ...legacyOnlyData(), content_translation: [] };
    render(<ToolView tool="brief_meeting" data={data} />);

    expect(screen.queryByTestId("content-translation-list")).toBeNull();
    expect(screen.getByText("Asks on me")).toBeInTheDocument();
  });
});
