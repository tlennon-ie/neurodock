/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { detectLocalModel } from "../../src/lib/detect-local-model.js";

afterEach(() => vi.restoreAllMocks());

describe("detectLocalModel", () => {
  it("returns lmstudio when :1234/v1/models responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes(":1234")
          ? ({
              ok: true,
              json: async () => ({ data: [{ id: "m" }] }),
            } as Response)
          : ({ ok: false } as Response),
      ),
    );
    expect(await detectLocalModel()).toEqual({
      provider: "lmstudio",
      endpoint: "http://localhost:1234/v1",
    });
  });

  it("returns ollama when :11434/api/tags responds ok and lmstudio does not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes(":11434")
          ? ({ ok: true, json: async () => ({ models: [] }) } as Response)
          : ({ ok: false } as Response),
      ),
    );
    expect(await detectLocalModel()).toEqual({
      provider: "ollama",
      endpoint: "http://localhost:11434",
    });
  });

  it("returns null when nothing is reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await detectLocalModel()).toBeNull();
  });
});
