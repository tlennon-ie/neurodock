/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * First-run convenience: probe localhost for a running LM Studio or Ollama so
 * onboarding can offer a one-tap "Connect (local, private)". Best-effort only;
 * null means "fall back to the simplest cloud path". LM Studio wins ties.
 *
 * Probes are routed through the service worker via fetchModelsViaWorker so
 * that cross-origin CORS issues are bypassed — LM Studio sends no
 * Access-Control-Allow-Origin, and plain Ollama rejects non-allowlisted
 * origins. The SW has host_permissions and bypasses CORS; the popup's
 * chrome-extension:// origin does not.
 */
import { fetchModelsViaWorker } from "./fetch-models-via-worker.js";

export interface DetectedLocalModel {
  readonly provider: "lmstudio" | "ollama";
  readonly endpoint: string;
}

const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Race a probe against a timeout. Returns true when the probe resolves
 * (even with an empty model list) and false when it rejects or times out.
 */
async function probeViaWorker(
  provider: "lmstudio" | "ollama",
  baseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const probe = fetchModelsViaWorker({ provider, baseUrl }).then(
    () => true,
    () => false,
  );
  const timer = new Promise<false>((resolve) =>
    setTimeout(() => resolve(false), timeoutMs),
  );
  return Promise.race([probe, timer]);
}

/**
 * Detect a locally running LLM provider by probing well-known default ports
 * via the service worker (to avoid CORS). Returns null when nothing is found
 * or when the runtime environment does not support chrome.runtime.sendMessage.
 *
 * @param timeoutMs - Per-probe timeout in milliseconds (default 1500). Exposed
 *   for tests; production callers should omit it.
 */
export async function detectLocalModel(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DetectedLocalModel | null> {
  try {
    if (
      await probeViaWorker("lmstudio", "http://localhost:1234/v1", timeoutMs)
    ) {
      return { provider: "lmstudio", endpoint: "http://localhost:1234/v1" };
    }
    if (await probeViaWorker("ollama", "http://localhost:11434", timeoutMs)) {
      return { provider: "ollama", endpoint: "http://localhost:11434" };
    }
    return null;
  } catch {
    return null;
  }
}
