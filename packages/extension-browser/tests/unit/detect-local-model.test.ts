/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { detectLocalModel } from "../../src/lib/detect-local-model.js";
import * as workerRelay from "../../src/lib/fetch-models-via-worker.js";

afterEach(() => vi.restoreAllMocks());

describe("detectLocalModel", () => {
  it("returns lmstudio when the worker relay succeeds for :1234", async () => {
    vi.spyOn(workerRelay, "fetchModelsViaWorker").mockImplementation(
      async (args) => {
        if (
          args.provider === "lmstudio" &&
          args.baseUrl === "http://localhost:1234/v1"
        ) {
          return ["some-model"];
        }
        throw new Error("not reachable");
      },
    );
    expect(await detectLocalModel()).toEqual({
      provider: "lmstudio",
      endpoint: "http://localhost:1234/v1",
    });
  });

  it("returns ollama when lmstudio probe fails but ollama succeeds", async () => {
    vi.spyOn(workerRelay, "fetchModelsViaWorker").mockImplementation(
      async (args) => {
        if (args.provider === "ollama") {
          return [];
        }
        throw new Error("ECONNREFUSED");
      },
    );
    expect(await detectLocalModel()).toEqual({
      provider: "ollama",
      endpoint: "http://localhost:11434",
    });
  });

  it("returns null when neither probe succeeds", async () => {
    vi.spyOn(workerRelay, "fetchModelsViaWorker").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );
    expect(await detectLocalModel()).toBeNull();
  });

  it("returns null (not a hang) when the relay never resolves within the timeout", async () => {
    vi.spyOn(workerRelay, "fetchModelsViaWorker").mockReturnValue(
      new Promise(() => {
        // intentionally never resolves
      }),
    );
    // Use a very short timeout so the test doesn't actually wait long
    expect(await detectLocalModel(10)).toBeNull();
  });
});
