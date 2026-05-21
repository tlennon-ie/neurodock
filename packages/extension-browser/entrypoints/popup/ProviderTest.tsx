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
        className="self-start border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        data-testid="provider-test-button"
      >
        {state.status === "running" ? "Testing…" : "Test connection"}
      </button>
      <div role="status" aria-live="polite" className="text-xs">
        {state.status === "ok" ? (
          <span
            className="text-success-light dark:text-success-dark"
            data-testid="provider-test-result-ok"
          >
            OK — got {state.preview.length} chars back.
          </span>
        ) : null}
        {state.status === "fail" ? (
          <span
            className="text-warn-light dark:text-warn-dark"
            data-testid="provider-test-result-fail"
          >
            Failed: {state.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
