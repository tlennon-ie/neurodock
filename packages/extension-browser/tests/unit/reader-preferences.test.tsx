/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReaderPreferences } from "../../src/components/ReaderPreferences.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

const base: Pick<
  ExtensionProfile,
  "neurotypes" | "outputFormat" | "maxChunkSize" | "additionalNotes"
> = {
  neurotypes: [],
  outputFormat: "answer_first",
  maxChunkSize: 5,
  additionalNotes: null,
};

describe("ReaderPreferences", () => {
  it("lite variant shows neurotypes + output shape, hides max-items + notes", () => {
    render(
      <ReaderPreferences variant="lite" value={base} onChange={() => {}} />,
    );
    expect(screen.getByTestId("reader-prefs-neurotypes")).toBeInTheDocument();
    expect(screen.getByTestId("reader-prefs-output-shape")).toBeInTheDocument();
    expect(
      screen.queryByTestId("reader-prefs-max-items"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("reader-prefs-notes")).not.toBeInTheDocument();
  });

  it("full variant shows all four controls", () => {
    render(
      <ReaderPreferences variant="full" value={base} onChange={() => {}} />,
    );
    expect(screen.getByTestId("reader-prefs-max-items")).toBeInTheDocument();
    expect(screen.getByTestId("reader-prefs-notes")).toBeInTheDocument();
  });

  it("toggling a neurotype emits an immutable patch", () => {
    const onChange = vi.fn();
    render(
      <ReaderPreferences variant="lite" value={base} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("reader-prefs-neurotype-adhd"));
    expect(onChange).toHaveBeenCalledWith({ neurotypes: ["adhd"] });
  });

  it("changing output shape emits a patch", () => {
    const onChange = vi.fn();
    render(
      <ReaderPreferences variant="full" value={base} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("reader-prefs-output-bullet_first"));
    expect(onChange).toHaveBeenCalledWith({ outputFormat: "bullet_first" });
  });
});
