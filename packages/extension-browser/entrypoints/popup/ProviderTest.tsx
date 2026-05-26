/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * ProviderTest.tsx
 *
 * The Settings tab's "Test" button. Calls the configured provider with a
 * tiny prompt and reports success / failure inline.
 *
 * Privacy: the test prompt contains no user content. It is a fixed string
 * ('Reply with {"ok": true}'). The response is not logged anywhere.
 */
import React, { useCallback, useState } from "react";
import { buildProviderFromProfile } from "../../src/lib/translation-client.js";
import { requestHostPermission } from "../../src/lib/permissions.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function isLocalhostBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    // Treat unparseable URLs as "no permission prompt needed" — the
    // subsequent provider fetch will fail with a separate, actionable
    // error and the test result UI surfaces that instead.
    return true;
  }
}

const TEST_PROMPT =
  'Reply with exactly this JSON object and nothing else: {"ok": true}';

type TestState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "ok"; readonly preview: string }
  | { readonly status: "fail"; readonly message: string };

export interface ProviderTestProps {
  readonly profile: ExtensionProfile;
}

export function ProviderTest({
  profile,
}: ProviderTestProps): React.ReactElement {
  const [state, setState] = useState<TestState>({ status: "idle" });

  const onClick = useCallback(async () => {
    setState({ status: "running" });
    // v0.0.4: when the local provider points at a non-localhost host,
    // request the per-host permission FIRST from this user-gesture
    // click handler. Without this the fetch is blocked at the
    // host_permissions layer with the opaque "Failed to fetch" error.
    if (
      profile.mode === "local" &&
      !isLocalhostBaseUrl(profile.localEndpoint)
    ) {
      const res = await requestHostPermission(profile.localEndpoint);
      if (!res.granted) {
        setState({
          status: "fail",
          message:
            res.reason === "user-denied"
              ? `Permission denied for ${res.origin}. Test connection will not work until you allow it.`
              : `Could not request permission for ${profile.localEndpoint}.`,
        });
        return;
      }
    }
    const resolved = buildProviderFromProfile(profile);
    if ("error" in resolved) {
      setState({ status: "fail", message: resolved.error });
      return;
    }
    try {
      const result = await resolved.provider.complete({
        tool: "translate_incoming",
        prompt: TEST_PROMPT,
        model: resolved.model,
      });
      const preview = result.text.slice(0, 80);
      // A successful HTTP 200 with empty body is *not* a success — it
      // usually means LM Studio answered an unknown endpoint (URL is
      // missing `/v1`) or no model is loaded and the request fell
      // through with a 200 + empty `choices` array. Report the
      // actionable cause instead of the misleading "OK — got 0 chars".
      if (preview.length === 0) {
        const isLmStudio = profile.localProvider === "lmstudio";
        setState({
          status: "fail",
          message: isLmStudio
            ? "Got HTTP 200 with no model output. Either no model is loaded in LM Studio (Server tab → Load model, or enable JIT loading), or the Base URL is missing the `/v1` suffix."
            : "Got HTTP 200 with no model output. Check that a model is loaded and the Base URL points at the provider's API root.",
        });
        return;
      }
      setState({ status: "ok", preview });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Unknown error";
      setState({ status: "fail", message });
    }
  }, [profile]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state.status === "running"}
        className="border-hairline bg-bg text-fg hover:bg-bg-nav focus-visible:outline-accent self-start border px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        data-testid="provider-test-button"
      >
        {state.status === "running" ? "Testing…" : "Test connection"}
      </button>
      <div role="status" aria-live="polite" className="text-sm">
        {state.status === "ok" ? (
          <span
            className="text-fg-accent"
            data-testid="provider-test-result-ok"
          >
            OK — got {state.preview.length} chars back.
          </span>
        ) : null}
        {state.status === "fail" ? (
          <span
            className="text-warn-fg"
            data-testid="provider-test-result-fail"
          >
            Failed: {state.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
