/**
 * SettingsTab.tsx
 *
 * Popup Settings tab for v0.0.2. Lets the user pick the provider, set
 * the Ollama endpoint, paste a cloud API key, and verify the
 * configuration via the Test button.
 *
 * Privacy rules baked into this UI:
 *
 *  - The plaintext API key is shown ONLY in the entry field, and ONLY
 *    until "Save" is clicked. After save, the field is replaced with a
 *    masked preview (`••••last4`) and "Replace" / "Clear" controls. The
 *    plaintext key never round-trips back to the DOM.
 *  - The API key persists to `chrome.storage.local` ONLY — never
 *    `sync`.
 *  - Switching to cloud mode requires both a provider AND a saved API
 *    key.
 *  - The default Mode remains Local Ollama. Mock is a developer-only
 *    explicit choice.
 */
import React, { useCallback, useMemo, useState } from "react";
import type { ExtensionMode, ExtensionProfile } from "../../src/lib/types.js";
import { ProviderTest } from "./ProviderTest.js";

export interface SettingsTabProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

const DEFAULT_MODELS: Record<string, string> = {
  ollama: "llama3.2:3b",
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
};

type SelectedMode = "local" | "cloud-anthropic" | "cloud-openai" | "mock";

function selectedModeFromProfile(profile: ExtensionProfile): SelectedMode {
  if (profile.mode === "mock") return "mock";
  if (profile.mode === "cloud" && profile.cloudProvider === "anthropic")
    return "cloud-anthropic";
  if (profile.mode === "cloud" && profile.cloudProvider === "openai")
    return "cloud-openai";
  return "local";
}

export function SettingsTab({
  profile,
  onChange,
}: SettingsTabProps): React.ReactElement {
  const selected = useMemo(() => selectedModeFromProfile(profile), [profile]);

  const setSelected = useCallback(
    async (next: SelectedMode) => {
      if (next === "local") {
        await onChange({
          mode: "local" as ExtensionMode,
          cloudProvider: null,
        });
        return;
      }
      if (next === "mock") {
        await onChange({ mode: "mock" as ExtensionMode });
        return;
      }
      const cloudProvider =
        next === "cloud-anthropic" ? "anthropic" : "openai";
      const fallbackModel = DEFAULT_MODELS[cloudProvider] ?? "";
      const willEnableCloud = profile.cloudApiKey !== null;
      await onChange({
        mode: willEnableCloud ? ("cloud" as ExtensionMode) : profile.mode,
        cloudProvider,
        cloudModel: profile.cloudModel ?? fallbackModel,
      });
    },
    [onChange, profile.cloudApiKey, profile.cloudModel, profile.mode]
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

      {selected === "local" ? (
        <LocalSettings profile={profile} onChange={onChange} />
      ) : null}

      {selected === "cloud-anthropic" || selected === "cloud-openai" ? (
        <CloudSettings
          profile={profile}
          providerId={selected === "cloud-anthropic" ? "anthropic" : "openai"}
          onChange={onChange}
        />
      ) : null}

      {selected === "mock" ? (
        <p className="text-xs text-neutral-500">
          Mock mode is a developer-only deterministic provider. Use it to
          verify the UI without a model. Output is always labelled [MOCK].
        </p>
      ) : null}

      <ProviderTest profile={profile} />
    </section>
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
      value: "local",
      label: "Local Ollama",
      help: "Default. Text never leaves your device. Requires Ollama running locally.",
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

interface LocalSettingsProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

function LocalSettings({
  profile,
  onChange,
}: LocalSettingsProps): React.ReactElement {
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
          placeholder="http://localhost:11434"
          className="border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="local-endpoint-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-neutral-500">Model</span>
        <input
          type="text"
          value={profile.localModel}
          onChange={(e) => void onChange({ localModel: e.target.value })}
          placeholder="llama3.2:3b"
          className="border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="local-model-input"
        />
      </label>
    </fieldset>
  );
}

interface CloudSettingsProps {
  readonly profile: ExtensionProfile;
  readonly providerId: "anthropic" | "openai";
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-neutral-500">Model</span>
        <input
          type="text"
          value={profile.cloudModel ?? ""}
          onChange={(e) => void onChange({ cloudModel: e.target.value })}
          placeholder={DEFAULT_MODELS[providerId]}
          className="border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="cloud-model-input"
        />
      </label>
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
              placeholder={providerId === "anthropic" ? "sk-ant-…" : "sk-…"}
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
