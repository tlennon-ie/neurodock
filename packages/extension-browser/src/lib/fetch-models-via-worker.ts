/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * fetchModelsViaWorker — popup-side helper that proxies model-list
 * requests through the service worker.
 *
 * The popup runs in the `chrome-extension://...` origin, where
 * cross-origin requests to local-LLM endpoints (LM Studio at
 * `localhost:1234`, etc.) hit CORS because those endpoints do not
 * send `Access-Control-Allow-Origin`. The SW has the relevant host
 * permissions and bypasses CORS, so we proxy through it.
 *
 * Falls back to a direct fetch when `chrome.runtime.sendMessage` is
 * unavailable — that path is exercised by unit tests via the shim in
 * tests/setup.ts and would otherwise force every test to mock the SW.
 *
 * Originally lived in entrypoints/popup/SettingsTab.tsx; extracted in
 * Roadmap A1 so the onboarding wizard can call the same code path
 * without re-implementing the SW round-trip.
 */
import {
  fetchModels,
  type ModelFetchableProvider,
} from "./providers/models.js";

export interface FetchModelsViaWorkerArgs {
  readonly provider: ModelFetchableProvider;
  readonly baseUrl?: string | null;
  readonly apiKey?: string | null;
}

export async function fetchModelsViaWorker(
  args: FetchModelsViaWorkerArgs,
): Promise<string[]> {
  const send = (
    globalThis as unknown as {
      chrome?: {
        runtime?: {
          sendMessage?: (msg: unknown) => Promise<unknown>;
        };
      };
    }
  ).chrome?.runtime?.sendMessage;
  if (!send) {
    return fetchModels(args);
  }
  let res: unknown;
  try {
    res = await send({
      type: "models:fetch",
      provider: args.provider,
      baseUrl: args.baseUrl ?? null,
      apiKey: args.apiKey ?? null,
    });
  } catch (cause: unknown) {
    throw cause instanceof Error
      ? cause
      : new Error("Service worker unreachable");
  }
  const env = res as {
    success?: boolean;
    models?: string[] | null;
    error?: string | null;
  } | null;
  if (env && env.success && Array.isArray(env.models)) {
    return env.models;
  }
  throw new Error(env?.error ?? "Service worker returned no models");
}

export type { ModelFetchableProvider };
