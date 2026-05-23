/**
 * SettingsTab.tsx
 *
 * Popup Settings tab. Lets the user pick the provider (Ollama, LM Studio,
 * Anthropic, OpenAI, OpenRouter, or Mock), configure endpoints and keys,
 * fetch the available models for a dropdown, and verify the configuration
 * via the Test button.
 *
 * Privacy rules baked into this UI:
 *
 *  - The plaintext API key is shown ONLY in the entry field, and ONLY
 *    until "Save" is clicked. After save, the field is replaced with a
 *    masked preview (`••••last4`) and "Replace" / "Clear" controls. The
 *    plaintext key never round-trips back to the DOM.
 *  - API keys persist to `chrome.storage.local` ONLY — never `sync`.
 *  - The default Mode remains Local Ollama. Mock is a developer-only
 *    explicit choice.
 *
 * v0.0.3 fixes:
 *  - Cloud radios are now always clickable. Selecting one immediately
 *    stages the provider intent so the corresponding fieldset appears
 *    even before a key has been saved. (Previously the radio appeared
 *    to "snap back" because the active mode was derived purely from
 *    `profile.mode`, which only flips to `cloud` after a key is stored.)
 *  - LM Studio is offered as a fifth provider.
 *  - Each provider that exposes a `/models`-style endpoint gets a
 *    "Refresh models" button that populates a dropdown.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ExtensionMode, ExtensionProfile } from "../../src/lib/types.js";
import {
  fetchModels,
  type ModelFetchableProvider,
} from "../../src/lib/providers/models.js";
import {
  listGrantedNonDefaultOrigins,
  requestHostPermission,
  revokeHostPermission,
} from "../../src/lib/permissions.js";
import { ProviderTest } from "./ProviderTest.js";

function isLocalhostBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return true; // Treat unparseable URLs as "no prompt needed" — the
    // fetch will fail with a separate error and surface it.
  }
}

function originOf(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    // Fall back to the raw user-typed string; downstream permission
    // checks will fail loudly if it is actually invalid.
    return baseUrl;
  }
}

export interface SettingsTabProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

const DEFAULT_MODELS: Record<string, string> = {
  ollama: "llama3.2:3b",
  lmstudio: "",
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  openrouter: "openrouter/auto",
};

const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";
const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

type CloudProviderId = "anthropic" | "openai" | "openrouter";

type SelectedMode =
  | "local-ollama"
  | "local-lmstudio"
  | "cloud-anthropic"
  | "cloud-openai"
  | "cloud-openrouter"
  | "mock";

function selectedModeFromProfile(profile: ExtensionProfile): SelectedMode {
  if (profile.mode === "mock") return "mock";
  // Cloud intent: surface whichever cloud provider has been staged, even
  // if no key is saved yet. This is the fix for the "OpenRouter radio
  // isn't clickable" bug — previously cloud-* selections only surfaced
  // when `mode === "cloud"`, which requires a saved key.
  if (profile.cloudProvider === "anthropic") return "cloud-anthropic";
  if (profile.cloudProvider === "openai") return "cloud-openai";
  if (profile.cloudProvider === "openrouter") return "cloud-openrouter";
  if (profile.localProvider === "lmstudio") return "local-lmstudio";
  return "local-ollama";
}

function cloudProviderFromSelected(
  selected: SelectedMode,
): CloudProviderId | null {
  if (selected === "cloud-anthropic") return "anthropic";
  if (selected === "cloud-openai") return "openai";
  if (selected === "cloud-openrouter") return "openrouter";
  return null;
}

export function SettingsTab({
  profile,
  onChange,
}: SettingsTabProps): React.ReactElement {
  const selected = useMemo(() => selectedModeFromProfile(profile), [profile]);

  const setSelected = useCallback(
    async (next: SelectedMode) => {
      if (next === "local-ollama") {
        await onChange({
          mode: "local" as ExtensionMode,
          localProvider: "ollama",
          // If switching back from LM Studio, restore the Ollama default
          // endpoint so users do not see a stale `:1234/v1` URL.
          localEndpoint:
            profile.localProvider === "lmstudio"
              ? OLLAMA_DEFAULT_BASE_URL
              : profile.localEndpoint,
          cloudProvider: null,
        });
        return;
      }
      if (next === "local-lmstudio") {
        await onChange({
          mode: "local" as ExtensionMode,
          localProvider: "lmstudio",
          localEndpoint:
            profile.localProvider === "lmstudio"
              ? profile.localEndpoint
              : LMSTUDIO_DEFAULT_BASE_URL,
          cloudProvider: null,
        });
        return;
      }
      if (next === "mock") {
        await onChange({ mode: "mock" as ExtensionMode });
        return;
      }
      const cloudProvider = cloudProviderFromSelected(next);
      if (cloudProvider === null) return;
      const fallbackModel = DEFAULT_MODELS[cloudProvider] ?? "";
      // Stage the cloud provider intent. Mode only flips to "cloud"
      // once a key is saved (the privacy contract from v0.0.2 still
      // holds). Until then, the cloud panel is visible so the user can
      // paste a key without first having to defeat the radio control.
      await onChange({
        cloudProvider,
        cloudModel: profile.cloudModel ?? fallbackModel,
        mode:
          profile.cloudApiKey !== null
            ? ("cloud" as ExtensionMode)
            : profile.mode,
      });
    },
    [
      onChange,
      profile.cloudApiKey,
      profile.cloudModel,
      profile.localEndpoint,
      profile.localProvider,
      profile.mode,
    ],
  );

  return (
    <section
      aria-labelledby="settings-heading"
      data-testid="settings-tab"
      className="flex flex-col gap-4"
    >
      <h2
        id="settings-heading"
        className="font-heading m-0 text-base font-medium"
      >
        Settings
      </h2>

      <ModeSelector selected={selected} onChange={setSelected} />

      {selected === "local-ollama" ? (
        <LocalOllamaSettings profile={profile} onChange={onChange} />
      ) : null}

      {selected === "local-lmstudio" ? (
        <LocalLMStudioSettings profile={profile} onChange={onChange} />
      ) : null}

      {cloudProviderFromSelected(selected) !== null ? (
        <CloudSettings
          profile={profile}
          providerId={cloudProviderFromSelected(selected) as CloudProviderId}
          onChange={onChange}
        />
      ) : null}

      {selected === "mock" ? (
        <p className="text-xs text-neutral-500">
          Mock mode is a developer-only deterministic provider. Use it to verify
          the UI without a model. Output is always labelled [MOCK].
        </p>
      ) : null}

      <ProviderTest profile={profile} />

      <HostPermissionsPanel />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Host permission UX (v0.0.4).
// ──────────────────────────────────────────────────────────────────────

interface NonLocalhostNoticeProps {
  readonly baseUrl: string;
  readonly testIdPrefix: string;
}

/**
 * Shown under a non-localhost Base URL. Lets the user explicitly grant
 * the per-host permission via a click handler (user-gesture context,
 * required by Chrome and Firefox). The same flow runs from Save / Test
 * / Refresh, but this affordance makes the contract visible.
 */
function NonLocalhostNotice({
  baseUrl,
  testIdPrefix,
}: NonLocalhostNoticeProps): React.ReactElement | null {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = useMemo(() => originOf(baseUrl), [baseUrl]);

  // Check the current grant state once on mount and whenever the URL
  // changes. This is a non-prompting check.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await listGrantedNonDefaultOrigins();
        if (cancelled) return;
        setGranted(all.includes(origin));
      } catch {
        // Permissions API rejection here is rare and not actionable from
        // the popup; default to "not granted" so the prompt button stays
        // visible. The user can click it to surface the real error.
        if (!cancelled) setGranted(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [origin]);

  // IMPORTANT: this handler is invoked from a direct button click, so
  // it preserves the user-gesture context required by Chrome and
  // Firefox for permissions.request(). Do not insert awaited debounces
  // before this call site.
  const onGrant = useCallback(async () => {
    setError(null);
    const res = await requestHostPermission(baseUrl);
    if (res.granted) {
      setGranted(true);
      return;
    }
    setGranted(false);
    if (res.reason === "user-denied") {
      setError(
        `Permission denied for ${origin}. Test connection will not work until you allow it.`,
      );
    } else if (res.reason === "invalid-url") {
      setError("That URL could not be parsed.");
    } else {
      setError(`Could not request permission for ${origin}.`);
    }
  }, [baseUrl, origin]);

  const onRevoke = useCallback(async () => {
    await revokeHostPermission(baseUrl);
    setGranted(false);
  }, [baseUrl]);

  if (isLocalhostBaseUrl(baseUrl)) return null;

  return (
    <div
      className="flex flex-col gap-1 border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
      data-testid={`${testIdPrefix}-host-permission`}
    >
      <span className="text-neutral-500">
        Host: <code className="font-mono">{origin}</code>{" "}
        {granted === true ? (
          <span
            className="text-success-light dark:text-success-dark"
            data-testid={`${testIdPrefix}-host-permission-granted`}
          >
            (permission granted)
          </span>
        ) : null}
      </span>
      {granted === true ? (
        <button
          type="button"
          onClick={() => void onRevoke()}
          className="self-start underline"
          data-testid={`${testIdPrefix}-host-permission-revoke`}
        >
          Revoke
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void onGrant()}
          className="self-start border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid={`${testIdPrefix}-host-permission-grant`}
        >
          Grant permission for {origin}
        </button>
      )}
      {error ? (
        <span
          className="text-warn-light dark:text-warn-dark"
          data-testid={`${testIdPrefix}-host-permission-error`}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Passive list of non-default origins currently granted via runtime
 * `chrome.permissions.request()`. Lets the user revoke each one.
 *
 * The default-granted origins (localhost, 127.0.0.1) and the cloud
 * provider hosts are intentionally NOT listed individually — those are
 * managed via the cloud-mode flow elsewhere in Settings.
 */
function HostPermissionsPanel(): React.ReactElement {
  const [origins, setOrigins] = useState<readonly string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const all = await listGrantedNonDefaultOrigins();
      setOrigins(all);
    } catch {
      // Permissions API rejection collapses the list to empty rather than
      // freezing the panel. The user can still revoke via Chrome's
      // chrome://extensions detail screen.
      setOrigins([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRevoke = useCallback(
    async (origin: string) => {
      await revokeHostPermission(origin);
      await refresh();
    },
    [refresh],
  );

  return (
    <fieldset
      className="m-0 flex flex-col gap-2 border border-neutral-200 p-3 dark:border-neutral-800"
      data-testid="host-permissions-panel"
    >
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        Host permissions
      </legend>
      <p className="m-0 text-xs text-neutral-500">
        Default-granted: <code className="font-mono">localhost</code>,{" "}
        <code className="font-mono">127.0.0.1</code>, the seven supported sites,
        and your chosen cloud provider host.
      </p>
      {origins.length === 0 ? (
        <p
          className="m-0 text-xs text-neutral-500"
          data-testid="host-permissions-empty"
        >
          No additional hosts granted.
        </p>
      ) : (
        <ul className="m-0 flex flex-col gap-1 p-0">
          {origins.map((o) => (
            <li
              key={o}
              className="flex items-center justify-between gap-2 text-xs"
              data-testid={`host-permission-row-${o}`}
            >
              <code className="font-mono">{o}</code>
              <button
                type="button"
                onClick={() => void onRevoke(o)}
                className="underline"
                data-testid={`host-permission-revoke-${o}`}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

interface ModeSelectorProps {
  readonly selected: SelectedMode;
  readonly onChange: (next: SelectedMode) => Promise<void>;
}

function ModeSelector({
  selected,
  onChange,
}: ModeSelectorProps): React.ReactElement {
  const options: { value: SelectedMode; label: string; help: string }[] = [
    {
      value: "local-ollama",
      label: "Local Ollama",
      help: "Default. Text never leaves your device. Requires Ollama running locally.",
    },
    {
      value: "local-lmstudio",
      label: "Local LM Studio",
      help: "Text never leaves your device. Requires LM Studio running and serving on localhost:1234.",
    },
    {
      value: "cloud-anthropic",
      label: "Cloud Anthropic",
      help: "Sends text to api.anthropic.com. Requires an API key.",
    },
    {
      value: "cloud-openai",
      label: "Cloud OpenAI",
      help: "Sends text to api.openai.com. Requires an API key.",
    },
    {
      value: "cloud-openrouter",
      label: "Cloud OpenRouter",
      help:
        "Sends text to openrouter.ai. Default model `openrouter/auto` " +
        "lets OpenRouter pick the best model per query. Requires an API key.",
    },
    {
      value: "mock",
      label: "Mock (developer-only)",
      help: "Deterministic placeholder. No model is called.",
    },
  ];

  return (
    <fieldset
      className="m-0 flex flex-col gap-2 border border-neutral-200 p-3 dark:border-neutral-800"
      data-testid="mode-selector"
    >
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        Where translation runs
      </legend>
      {options.map((opt) => (
        <label key={opt.value} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="provider-mode"
            value={opt.value}
            checked={selected === opt.value}
            onChange={() => void onChange(opt.value)}
            className="mt-1"
            data-testid={`mode-radio-${opt.value}`}
          />
          <span className="flex flex-col">
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs text-neutral-500">{opt.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface LocalProviderProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

function LocalOllamaSettings({
  profile,
  onChange,
}: LocalProviderProps): React.ReactElement {
  const endpoint = profile.localEndpoint || OLLAMA_DEFAULT_BASE_URL;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border border-neutral-200 p-3 dark:border-neutral-800">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        Local Ollama
      </legend>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-neutral-500">Endpoint URL</span>
        <input
          type="url"
          value={profile.localEndpoint}
          onChange={(e) => void onChange({ localEndpoint: e.target.value })}
          placeholder={OLLAMA_DEFAULT_BASE_URL}
          className="border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="local-endpoint-input"
        />
      </label>
      <NonLocalhostNotice baseUrl={endpoint} testIdPrefix="local" />
      <ModelPicker
        provider="ollama"
        baseUrl={endpoint}
        apiKey={null}
        currentModel={profile.localModel}
        defaultModel={DEFAULT_MODELS.ollama ?? ""}
        modelKey="localModel"
        onChange={onChange}
        testIdPrefix="local"
      />
    </fieldset>
  );
}

function LocalLMStudioSettings({
  profile,
  onChange,
}: LocalProviderProps): React.ReactElement {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const hasStoredKey = profile.localApiKey !== null;
  const last4 = profile.localApiKey?.slice(-4) ?? "";

  const saveKey = useCallback(async () => {
    if (pendingKey.length === 0) return;
    await onChange({ localApiKey: pendingKey });
    setPendingKey("");
  }, [onChange, pendingKey]);

  const clearKey = useCallback(async () => {
    await onChange({ localApiKey: null });
  }, [onChange]);

  const endpoint =
    profile.localEndpoint && profile.localEndpoint !== OLLAMA_DEFAULT_BASE_URL
      ? profile.localEndpoint
      : LMSTUDIO_DEFAULT_BASE_URL;

  return (
    <fieldset className="m-0 flex flex-col gap-2 border border-neutral-200 p-3 dark:border-neutral-800">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        Local LM Studio
      </legend>
      <p className="m-0 text-xs text-neutral-500">
        Start LM Studio, load a model, and switch the Server tab to{" "}
        <code className="font-mono">Running</code>. The default base URL is{" "}
        <code className="font-mono">{LMSTUDIO_DEFAULT_BASE_URL}</code>. If LM
        Studio is bound to a non-localhost address (e.g.{" "}
        <code className="font-mono">169.254.x.x</code> or a LAN IP), set the
        base URL under Advanced and grant the per-host permission below.
      </p>
      <NonLocalhostNotice baseUrl={endpoint} testIdPrefix="lmstudio" />
      <ModelPicker
        provider="lmstudio"
        baseUrl={endpoint}
        apiKey={profile.localApiKey}
        currentModel={profile.localModel}
        defaultModel={DEFAULT_MODELS.lmstudio ?? ""}
        modelKey="localModel"
        onChange={onChange}
        testIdPrefix="lmstudio"
      />
      <details
        className="text-sm"
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-xs text-neutral-500">
          Advanced (custom base URL, optional API key)
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-neutral-500">Base URL</span>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => void onChange({ localEndpoint: e.target.value })}
              placeholder={LMSTUDIO_DEFAULT_BASE_URL}
              className="border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
              data-testid="lmstudio-base-url-input"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-neutral-500">
              API key (only if you put LM Studio behind a reverse proxy)
            </span>
            {hasStoredKey ? (
              <div className="flex items-center gap-2">
                <code
                  className="border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                  data-testid="lmstudio-api-key-masked"
                >
                  ••••{last4}
                </code>
                <button
                  type="button"
                  onClick={() => void clearKey()}
                  className="text-xs underline"
                  data-testid="lmstudio-api-key-clear"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={pendingKey}
                  onChange={(e) => setPendingKey(e.target.value)}
                  placeholder="optional"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                  data-testid="lmstudio-api-key-input"
                />
                <button
                  type="button"
                  onClick={() => void saveKey()}
                  disabled={pendingKey.length === 0}
                  className="border border-neutral-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
                  data-testid="lmstudio-api-key-save"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      </details>
    </fieldset>
  );
}

interface CloudSettingsProps {
  readonly profile: ExtensionProfile;
  readonly providerId: CloudProviderId;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

function apiKeyPlaceholder(providerId: CloudProviderId): string {
  if (providerId === "anthropic") return "sk-ant-…";
  if (providerId === "openrouter") return "sk-or-…";
  return "sk-…";
}

function modelHint(providerId: CloudProviderId): string | null {
  if (providerId === "openrouter") {
    return (
      "Use `openrouter/auto` for auto-routing, or any model slug from " +
      "openrouter.ai/models (e.g. anthropic/claude-3-5-sonnet, " +
      "meta-llama/llama-3.3-70b-instruct)."
    );
  }
  if (providerId === "anthropic") {
    return (
      "Anthropic does not expose a models endpoint. Refresh loads the " +
      "extension's hardcoded supported list; new releases require an " +
      "extension update."
    );
  }
  return null;
}

function CloudSettings({
  profile,
  providerId,
  onChange,
}: CloudSettingsProps): React.ReactElement {
  const [pendingKey, setPendingKey] = useState("");
  const hasStoredKey = profile.cloudApiKey !== null;
  const last4 = profile.cloudApiKey?.slice(-4) ?? "";

  const saveKey = useCallback(async () => {
    if (pendingKey.length === 0) return;
    await onChange({
      cloudProvider: providerId,
      cloudModel: profile.cloudModel ?? DEFAULT_MODELS[providerId] ?? "",
      cloudApiKey: pendingKey,
      mode: "cloud" as ExtensionMode,
    });
    setPendingKey("");
  }, [onChange, pendingKey, providerId, profile.cloudModel]);

  const clearKey = useCallback(async () => {
    await onChange({
      cloudApiKey: null,
      mode: "local" as ExtensionMode,
    });
  }, [onChange]);

  return (
    <fieldset className="m-0 flex flex-col gap-2 border border-neutral-200 p-3 dark:border-neutral-800">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        Cloud {providerId}
      </legend>
      <ModelPicker
        provider={providerId}
        baseUrl={null}
        apiKey={profile.cloudApiKey}
        currentModel={profile.cloudModel ?? ""}
        defaultModel={DEFAULT_MODELS[providerId] ?? ""}
        modelKey="cloudModel"
        onChange={onChange}
        testIdPrefix="cloud"
      />
      {modelHint(providerId) ? (
        <span className="text-xs text-neutral-500">
          {modelHint(providerId)}
        </span>
      ) : null}
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-neutral-500">API key</span>
        {hasStoredKey ? (
          <div className="flex items-center gap-2">
            <code
              className="border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
              data-testid="cloud-api-key-masked"
            >
              ••••{last4}
            </code>
            <button
              type="button"
              onClick={() => void clearKey()}
              className="text-xs underline"
              data-testid="cloud-api-key-clear"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={pendingKey}
              onChange={(e) => setPendingKey(e.target.value)}
              placeholder={apiKeyPlaceholder(providerId)}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
              data-testid="cloud-api-key-input"
            />
            <button
              type="button"
              onClick={() => void saveKey()}
              disabled={pendingKey.length === 0}
              className="border border-neutral-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
              data-testid="cloud-api-key-save"
            >
              Save
            </button>
          </div>
        )}
        <span className="text-xs text-neutral-500">
          Stored on this device only via <code>chrome.storage.local</code>.
          Never synced.
        </span>
      </div>
    </fieldset>
  );
}

interface ModelPickerProps {
  readonly provider: ModelFetchableProvider;
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
  readonly currentModel: string;
  readonly defaultModel: string;
  readonly modelKey: "localModel" | "cloudModel";
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
  readonly testIdPrefix: string;
}

type FetchState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly models: readonly string[] }
  | { readonly status: "fail"; readonly message: string };

function ModelPicker({
  provider,
  baseUrl,
  apiKey,
  currentModel,
  defaultModel,
  modelKey,
  onChange,
  testIdPrefix,
}: ModelPickerProps): React.ReactElement {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  const onRefresh = useCallback(async () => {
    setState({ status: "loading" });
    // v0.0.4: for local providers pointed at a non-localhost host, ask
    // for the per-host permission FIRST. This MUST happen inside the
    // click handler (no awaited debounce before the request) so the
    // browser still treats the call as a user gesture. Chrome and
    // Firefox both enforce this.
    if (
      (provider === "ollama" || provider === "lmstudio") &&
      baseUrl !== null &&
      !isLocalhostBaseUrl(baseUrl)
    ) {
      const res = await requestHostPermission(baseUrl);
      if (!res.granted) {
        setState({
          status: "fail",
          message:
            res.reason === "user-denied"
              ? `Permission denied for ${res.origin}. Test connection will not work until you allow it.`
              : `Could not request permission for ${baseUrl}.`,
        });
        return;
      }
    }
    try {
      const models = await fetchModels({
        provider,
        baseUrl,
        apiKey,
      });
      setState({ status: "ok", models });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Unknown error";
      setState({
        status: "fail",
        message: friendlyFetchError(provider, message),
      });
    }
  }, [apiKey, baseUrl, provider]);

  const handleModelChange = useCallback(
    (value: string) => {
      void onChange({ [modelKey]: value } as Partial<ExtensionProfile>);
    },
    [modelKey, onChange],
  );

  const models = state.status === "ok" ? state.models : [];
  const showDropdown = state.status === "ok" && models.length > 0;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-neutral-500">Model</span>
      <div className="flex items-center gap-2">
        {showDropdown ? (
          <select
            value={currentModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className="flex-1 border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            data-testid={`${testIdPrefix}-model-select`}
          >
            {currentModel && !models.includes(currentModel) ? (
              <option value={currentModel}>{currentModel} (current)</option>
            ) : null}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={currentModel}
            onChange={(e) => handleModelChange(e.target.value)}
            placeholder={defaultModel}
            className="flex-1 border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            data-testid={`${testIdPrefix}-model-input`}
          />
        )}
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={state.status === "loading"}
          className="border border-neutral-300 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid={`${testIdPrefix}-model-refresh`}
        >
          {state.status === "loading" ? "Loading…" : "Refresh models"}
        </button>
      </div>
      {state.status === "ok" && models.length === 0 ? (
        <span className="text-xs text-neutral-500">
          No models found. Load a model first, then try again.
        </span>
      ) : null}
      {state.status === "fail" ? (
        <span
          className="text-warn-light dark:text-warn-dark text-xs"
          data-testid={`${testIdPrefix}-model-error`}
        >
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

function friendlyFetchError(
  provider: ModelFetchableProvider,
  raw: string,
): string {
  if (/UNREACHABLE/i.test(raw)) {
    return (
      `Couldn't reach ${provider}. Check the URL is correct and the ` +
      `server is running.`
    );
  }
  if (/AUTH_FAILED|API_KEY_MISSING|API.*KEY.*MISSING/i.test(raw)) {
    return `Couldn't authenticate with ${provider}. Check your API key.`;
  }
  return raw;
}
