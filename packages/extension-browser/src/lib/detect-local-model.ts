/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * First-run convenience: probe localhost for a running LM Studio or Ollama so
 * onboarding can offer a one-tap "Connect (local, private)". Best-effort only;
 * null means "fall back to the simplest cloud path". LM Studio wins ties.
 */
export interface DetectedLocalModel {
  readonly provider: "lmstudio" | "ollama";
  readonly endpoint: string;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function detectLocalModel(): Promise<DetectedLocalModel | null> {
  if (await reachable("http://localhost:1234/v1/models")) {
    return { provider: "lmstudio", endpoint: "http://localhost:1234/v1" };
  }
  if (await reachable("http://localhost:11434/api/tags")) {
    return { provider: "ollama", endpoint: "http://localhost:11434" };
  }
  return null;
}
