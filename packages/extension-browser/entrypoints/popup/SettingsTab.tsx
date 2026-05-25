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
import type {
  ExtensionMode,
  ExtensionProfile,
  Neurotype,
  OutputFormat,
} from "../../src/lib/types.js";
import { type ModelFetchableProvider } from "../../src/lib/providers/models.js";
import { fetchModelsViaWorker } from "../../src/lib/fetch-models-via-worker.js";
import {
  DEFAULT_PACING_INTERVAL,
  PACING_INTERVAL_OPTIONS,
  hasOcdOrAudhd,
  loadPacingPreferences,
  savePacingPreferences,
  type PacingInterval,
  type PacingPreferences,
} from "../../src/lib/pacing.js";
import {
  hasImageTranslationGlobalAccess,
  listGrantedNonDefaultOrigins,
  requestHostPermission,
  requestImageTranslationGlobalAccess,
  revokeHostPermission,
  revokeImageTranslationGlobalAccess,
} from "../../src/lib/permissions.js";
import { ProviderTest } from "./ProviderTest.js";
import { AccessibilitySection } from "./AccessibilitySection.js";

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
  google: "gemini-2.0-flash",
};

const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";
const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

type CloudProviderId = "anthropic" | "openai" | "openrouter" | "google";

type SelectedMode =
  | "local-ollama"
  | "local-lmstudio"
  | "cloud-anthropic"
  | "cloud-openai"
  | "cloud-openrouter"
  | "cloud-google"
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
  if (profile.cloudProvider === "google") return "cloud-google";
  if (profile.localProvider === "lmstudio") return "local-lmstudio";
  return "local-ollama";
}

function cloudProviderFromSelected(
  selected: SelectedMode,
): CloudProviderId | null {
  if (selected === "cloud-anthropic") return "anthropic";
  if (selected === "cloud-openai") return "openai";
  if (selected === "cloud-openrouter") return "openrouter";
  if (selected === "cloud-google") return "google";
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
        <p className="text-fg-muted text-sm">
          Mock mode is a developer-only deterministic provider. Use it to verify
          the UI without a model. Output is always labelled [MOCK].
        </p>
      ) : null}

      <ProviderTest profile={profile} />

      <AccessibilitySection />

      <ProactiveGuardrails />

      <PacingCopilotSection profile={profile} />

      <DebugTools />

      <ReaderPreferences profile={profile} onChange={onChange} />

      <ImageTranslationPermission />

      <HostPermissionsPanel />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Proactive guardrails panel.
//
// Phase 2 (service-worker watchdog) is toggled via
// chrome.storage.local["neurodock.watchdog.enabled"], read on demand by
// src/lib/proactive-watchdog.ts. Default: on. This panel surfaces the
// flip so users don't need DevTools.
//
// Phase 1 (Python hook) and Phase 3 (standalone daemon) live outside
// the extension sandbox and can only be documented here.
// ──────────────────────────────────────────────────────────────────────

const WATCHDOG_ENABLED_KEY = "neurodock.watchdog.enabled";
const PROMPT_LOG_KEY = "neurodock.debug.logPrompts";

interface WatchdogStorageArea {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
}

function getWatchdogStorage(): WatchdogStorageArea | null {
  const storage = (
    globalThis as unknown as {
      chrome?: {
        storage?: {
          local?: WatchdogStorageArea;
        };
      };
    }
  ).chrome?.storage?.local;
  return storage ?? null;
}

function ProactiveGuardrails(): React.ReactElement {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storage = getWatchdogStorage();
      if (storage === null) {
        if (!cancelled) setEnabled(true);
        return;
      }
      try {
        const got = await storage.get(WATCHDOG_ENABLED_KEY);
        if (cancelled) return;
        const raw = got[WATCHDOG_ENABLED_KEY];
        // Default-on: only `false` disables. Unset, null, or any other
        // value keeps the watchdog active.
        setEnabled(raw === false ? false : true);
      } catch {
        if (!cancelled) setEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = useCallback(async () => {
    const next = !(enabled ?? true);
    setEnabled(next);
    const storage = getWatchdogStorage();
    if (storage === null) return;
    try {
      await storage.set({ [WATCHDOG_ENABLED_KEY]: next });
    } catch {
      // Revert on failure so the UI reflects actual persisted state.
      setEnabled(!next);
    }
  }, [enabled]);

  const checked = enabled ?? true;

  return (
    <fieldset
      className="border-hairline m-0 flex flex-col gap-3 border p-3"
      data-testid="proactive-guardrails"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Proactive guardrails
      </legend>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => void onToggle()}
          className="mt-0.5"
          data-testid="watchdog-toggle"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">
            Extension watchdog (auto-detects hyperfocus / late-night /
            rumination)
          </span>
          <span className="text-fg-muted text-sm">
            Runs every 5 min. Surfaces a notification + amber toolbar badge when
            a pattern trips. Local-only; nothing leaves your device.
          </span>
        </span>
      </label>

      <div
        className="border-hairline flex flex-col gap-1 border p-2"
        data-testid="guardrail-phase1-info"
      >
        <span className="text-sm font-medium text-fg">
          Claude Code hook (Phase 1)
        </span>
        <span className="text-fg-muted text-sm">
          Auto-fires chronometric / rumination / sycophancy checks on every Nth
          Claude Code tool use. Banners on stderr.
        </span>
        <code className="font-mono border-hairline bg-bg-code text-fg mt-1 block border px-2 py-1 text-sm">
          neurodock install-hooks --self-test
        </code>
        <span className="text-fg-muted text-sm">Disable with:</span>
        <code className="font-mono border-hairline bg-bg-code text-fg block border px-2 py-1 text-sm">
          export NEURODOCK_GUARDRAILS=off
        </code>
      </div>

      <div
        className="border-hairline flex flex-col gap-1 border p-2"
        data-testid="guardrail-phase3-info"
      >
        <span className="text-sm font-medium text-fg">
          Standalone daemon (Phase 3)
        </span>
        <span className="text-fg-muted text-sm">
          Host-agnostic. Catches you working in the terminal at 02:00 too.
        </span>
        <code className="font-mono border-hairline bg-bg-code text-fg mt-1 block border px-2 py-1 text-sm">
          neurodock install-hooks --install-daemon
        </code>
      </div>
    </fieldset>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Debug tools (0.0.25).
//
// `Log final prompt to console` — when enabled, providers print the
// fully-assembled prompt (template + input + schema + addendum) to the
// service worker DevTools console immediately before fetch. Default
// off; explicit opt-in only. Useful when a user reports "the addendum
// isn't doing anything" — we ask them to enable the toggle and paste
// the logged prompt from chrome://extensions → service worker.
// ──────────────────────────────────────────────────────────────────────

function DebugTools(): React.ReactElement {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storage = getWatchdogStorage();
      if (storage === null) {
        if (!cancelled) setEnabled(false);
        return;
      }
      try {
        const got = await storage.get(PROMPT_LOG_KEY);
        if (cancelled) return;
        setEnabled(got[PROMPT_LOG_KEY] === true);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = useCallback(async () => {
    const next = !(enabled ?? false);
    setEnabled(next);
    const storage = getWatchdogStorage();
    if (storage === null) return;
    try {
      await storage.set({ [PROMPT_LOG_KEY]: next });
    } catch {
      setEnabled(!next);
    }
  }, [enabled]);

  const checked = enabled ?? false;

  return (
    <fieldset
      className="border-hairline m-0 flex flex-col gap-2 border p-3"
      data-testid="debug-tools"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Debug tools
      </legend>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => void onToggle()}
          className="mt-0.5"
          data-testid="prompt-log-toggle"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Log final prompt to console</span>
          <span className="text-fg-muted text-sm">
            Prints the full prompt (template + your input + schema + reader
            preferences) to the service-worker DevTools console before each
            translate call. Off by default. Local-only — nothing leaves your
            device. View at{" "}
            <code className="font-mono">chrome://extensions</code> → NeuroDock →
            "service worker".
          </span>
        </span>
      </label>
    </fieldset>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Pacing copilot (RFC B3).
//
// Configurable break-suggestion cadence and timebox-on-start prompt.
// Default ON for most users (45-min interval); default OFF for users
// whose `profile.neurotypes` contains `ocd` or `audhd` — those users
// see a one-time opt-in prompt instead of unsolicited nudges.
//
// Storage: chrome.storage.local["neurodock.pacing.v1"] (see pacing.ts).
// ──────────────────────────────────────────────────────────────────────

interface PacingCopilotSectionProps {
  readonly profile: ExtensionProfile;
}

function PacingCopilotSection({
  profile,
}: PacingCopilotSectionProps): React.ReactElement {
  const [prefs, setPrefs] = useState<PacingPreferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadPacingPreferences(profile.neurotypes);
      if (!cancelled) setPrefs(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.neurotypes]);

  const update = useCallback(
    async (patch: Partial<PacingPreferences>) => {
      if (prefs === null) return;
      const next: PacingPreferences = {
        ...prefs,
        ...patch,
        schemaVersion: 1,
      };
      setPrefs(next);
      try {
        await savePacingPreferences(next);
      } catch {
        // Revert on failure so the UI reflects actual persisted state.
        setPrefs(prefs);
      }
    },
    [prefs],
  );

  if (prefs === null) {
    return (
      <fieldset
        className="border-hairline m-0 flex flex-col gap-2 border p-3"
        data-testid="pacing-copilot"
      >
        <legend className="text-fg-muted px-1 text-sm font-medium">
          Pacing copilot
        </legend>
        <p className="text-fg-muted text-sm">Loading pacing preferences…</p>
      </fieldset>
    );
  }

  const showOptInHint =
    hasOcdOrAudhd(profile.neurotypes) && !prefs.ocdOptInShown;

  return (
    <fieldset
      className="border-hairline m-0 flex flex-col gap-3 border p-3"
      data-testid="pacing-copilot"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Pacing copilot
      </legend>

      {showOptInHint ? (
        <p
          className="text-fg-muted text-sm"
          data-testid="pacing-ocd-opt-in-hint"
        >
          Pacing nudges are off by default for your neurotype. Enable below only
          if you want them.
        </p>
      ) : null}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(event) =>
            void update({
              enabled: event.target.checked,
              ocdOptInShown: true,
            })
          }
          className="mt-0.5"
          data-testid="pacing-enabled-toggle"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Enable pacing nudges</span>
          <span className="text-fg-muted text-sm">
            Periodic, dismissable suggestions to consider a short break during
            long stretches. Sentence-case, no demanding language.
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Nudge interval</span>
        <select
          value={prefs.intervalMinutes}
          onChange={(event) =>
            void update({
              intervalMinutes: Number(event.target.value) as PacingInterval,
            })
          }
          disabled={!prefs.enabled}
          className="border-hairline w-fit border bg-bg p-1"
          data-testid="pacing-interval-select"
        >
          {PACING_INTERVAL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              Every {minutes} min
            </option>
          ))}
        </select>
        <span className="text-fg-muted text-sm">
          Default: every {DEFAULT_PACING_INTERVAL} min.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.timeboxOnStart}
          onChange={(event) =>
            void update({ timeboxOnStart: event.target.checked })
          }
          disabled={!prefs.enabled}
          className="mt-0.5"
          data-testid="pacing-timebox-toggle"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">
            Suggest a timebox when starting a new stretch
          </span>
          <span className="text-fg-muted text-sm">
            When a new session begins, ask if you want to set a 25 or 50 minute
            box. Off skips the prompt.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Reader preferences (0.0.22): per-neurotype prompt tailoring.
//
// Surfaces the four ExtensionProfile fields that drive
// buildNeurotypeAddendum:
//   - neurotypes (multi-select checkboxes; 8 enum values)
//   - outputFormat (3-radio)
//   - maxChunkSize (number input, 1..20)
//   - additionalNotes (textarea)
//
// Saves immediately on each change. Native-host users see the same
// values mirrored from ~/.neurodock/profile.yaml; extension-local
// users get this panel as their only configuration surface.
// ──────────────────────────────────────────────────────────────────────

interface ReaderPreferencesProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void> | void;
}

const NEUROTYPE_OPTIONS: ReadonlyArray<{
  readonly value: Neurotype;
  readonly label: string;
  readonly hint: string;
}> = [
  { value: "adhd", label: "ADHD", hint: "answer-first, short lists" },
  { value: "asd", label: "Autism / ASD", hint: "literal subtext, no idioms" },
  {
    value: "audhd",
    label: "AuDHD",
    hint: "fused — picks both ADHD and ASD rules without doubling up",
  },
  { value: "ocd", label: "OCD", hint: "low-pressure phrasing" },
  {
    value: "dyslexia",
    label: "Dyslexia",
    hint: "short sentences, plain words",
  },
  {
    value: "dyspraxia",
    label: "Dyspraxia",
    hint: "absolute dates, low sequencing burden",
  },
  {
    value: "tourette",
    label: "Tourette's",
    hint: "no prompt change (motion already handled in UI)",
  },
  {
    value: "other",
    label: "Other / self-described",
    hint: "use the notes box",
  },
];

function ReaderPreferences({
  profile,
  onChange,
}: ReaderPreferencesProps): React.ReactElement {
  const toggleNeurotype = (value: Neurotype, checked: boolean): void => {
    const next = new Set<Neurotype>(profile.neurotypes);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    void onChange({ neurotypes: Array.from(next) });
  };
  const showAudhdHint =
    profile.neurotypes.includes("adhd") &&
    profile.neurotypes.includes("asd") &&
    !profile.neurotypes.includes("audhd");
  return (
    <fieldset
      data-testid="reader-preferences"
      className="border-hairline m-0 flex flex-col gap-3 border p-3"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Reader preferences (shapes every translation)
      </legend>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-fg">
          Which describe you?
        </label>
        <p className="text-fg-muted text-sm">
          Self-ID only — no diagnosis required. Tick all that apply. Used to
          tailor prompts; never sent off-device unless cloud mode is on.
        </p>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {NEUROTYPE_OPTIONS.map((opt) => {
            const checked = profile.neurotypes.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-start gap-2 text-sm"
                title={opt.hint}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleNeurotype(opt.value, e.target.checked)}
                  data-testid={`neurotype-${opt.value}`}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-fg-muted block text-sm">
                    {opt.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {showAudhdHint ? (
          <p
            data-testid="audhd-hint"
            className="border-warn-border bg-warn-bg text-warn-fg mt-1 border p-1.5 text-sm"
          >
            Looks like you might want <strong>AuDHD</strong> — it's a fused
            block instead of stacking ADHD + ASD. Tick AuDHD and untick the
            other two if that's right.
          </p>
        ) : null}
        <p
          data-testid="reader-prefs-model-size-note"
          className="text-fg-muted mt-2 text-sm italic"
        >
          Reader preferences shape the prompt sent to the model. Larger models
          honor them better than smaller ones. With a 4B local model (e.g.
          gemma-4-e4b) you may see only subtle differences between neurotypes;
          with cloud mode or a 7B+ local model the differentiation is stronger.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-fg">Output shape</label>
        <div className="flex flex-col gap-0.5 text-sm">
          {(
            [
              {
                value: "answer_first",
                label: "Answer-first — verdict in the first phrase",
              },
              {
                value: "conventional",
                label: "Conventional — brief context, then verdict",
              },
              {
                value: "bullet_first",
                label: "Bullet-first — bullet list before any prose",
              },
            ] as ReadonlyArray<{ value: OutputFormat; label: string }>
          ).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="output-format"
                value={opt.value}
                checked={profile.outputFormat === opt.value}
                onChange={() => void onChange({ outputFormat: opt.value })}
                data-testid={`outputFormat-${opt.value}`}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="max-chunk-size" className="text-sm font-medium text-fg">
          Max items in lists
        </label>
        <input
          id="max-chunk-size"
          type="number"
          min={1}
          max={20}
          value={profile.maxChunkSize}
          onChange={(e) => {
            const parsed = Number.parseInt(e.target.value, 10);
            if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 20) {
              void onChange({ maxChunkSize: parsed });
            }
          }}
          data-testid="max-chunk-size"
          className="border-hairline bg-bg text-fg w-20 border px-2 py-0.5 text-sm"
        />
        <p className="text-fg-muted text-sm">
          How many items the AI shows before stopping. Manifesto default is 5
          (ADHD-tuned). Schema lets you go up to 20.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="additional-notes"
          className="text-sm font-medium text-fg"
        >
          Anything else the AI should know about you?
        </label>
        <textarea
          id="additional-notes"
          value={profile.additionalNotes ?? ""}
          onChange={(e) =>
            void onChange({
              additionalNotes:
                e.target.value.length > 0 ? e.target.value : null,
            })
          }
          rows={3}
          maxLength={500}
          placeholder='Example: "I get overwhelmed by long paragraphs" or "please always quote the source verbatim"'
          data-testid="additional-notes"
          className="border-hairline bg-bg text-fg w-full border p-2 text-sm"
        />
        <p className="text-fg-muted text-sm">
          Treated as a literal instruction set to the AI. 500-character max.
        </p>
      </div>
    </fieldset>
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
      className="border-hairline flex flex-col gap-1 border px-2 py-1 text-sm"
      data-testid={`${testIdPrefix}-host-permission`}
    >
      <span className="text-fg-muted">
        Host: <code className="font-mono">{origin}</code>{" "}
        {granted === true ? (
          <span
            className="text-fg-accent"
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
          className="border-hairline bg-bg text-fg hover:bg-bg-nav self-start border px-2 py-1 text-sm"
          data-testid={`${testIdPrefix}-host-permission-grant`}
        >
          Grant permission for {origin}
        </button>
      )}
      {error ? (
        <span
          className="text-warn-fg"
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
/**
 * 0.0.19: one-time grant for arbitrary HTTPS image fetches. Without
 * this the SW prompts per-host every time the user describes an image
 * on a new site. The button MUST be wired to a direct click handler so
 * the user-gesture context reaches `chrome.permissions.request`.
 */
function ImageTranslationPermission(): React.ReactElement {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const has = await hasImageTranslationGlobalAccess();
        if (!cancelled) setGranted(has);
      } catch {
        if (!cancelled) setGranted(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onGrant = useCallback(async () => {
    setMessage(null);
    const res = await requestImageTranslationGlobalAccess();
    setGranted(res.granted);
    if (!res.granted) {
      setMessage(
        res.reason === "user-denied"
          ? "Denied. Image translation will still work per-site if you accept the right-click prompt instead."
          : "Permissions API unavailable.",
      );
    }
  }, []);

  const onRevoke = useCallback(async () => {
    setMessage(null);
    await revokeImageTranslationGlobalAccess();
    setGranted(false);
  }, []);

  return (
    <fieldset
      className="border-hairline m-0 flex flex-col gap-2 border p-3"
      data-testid="image-translation-permission"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Image translation
      </legend>
      <p className="m-0 text-fg-muted text-sm">
        Right-click any image → "NeuroDock: describe image (vision)" needs
        permission to fetch the image bytes (so it can base64-encode them for
        your vision model). Grant once for every HTTPS site, or accept the
        per-site prompt at right-click time.
      </p>
      {granted === null ? (
        <p className="m-0 text-fg-muted text-sm">Checking…</p>
      ) : granted ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>
            <strong>Granted</strong> — image translation works on every HTTPS
            site.
          </span>
          <button
            type="button"
            onClick={() => void onRevoke()}
            className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-2 py-1 text-sm"
            data-testid="image-perms-revoke"
          >
            Revoke
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Not granted. You'll be prompted per-site instead.</span>
          <button
            type="button"
            onClick={() => void onGrant()}
            className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-2 py-1 text-sm"
            data-testid="image-perms-grant"
          >
            Enable for every site
          </button>
        </div>
      )}
      {message ? <p className="text-warn-fg m-0 text-sm">{message}</p> : null}
    </fieldset>
  );
}

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
      className="border-hairline m-0 flex flex-col gap-2 border p-3"
      data-testid="host-permissions-panel"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Host permissions
      </legend>
      <details className="m-0 text-fg-muted text-sm">
        <summary className="cursor-pointer">
          Always-granted hosts (click to view)
        </summary>
        <div className="mt-1 flex flex-col gap-0.5 pl-3">
          <span>
            <strong>Local providers:</strong>{" "}
            <code className="font-mono">localhost</code>,{" "}
            <code className="font-mono">127.0.0.1</code>
          </span>
          <span>
            <strong>Cloud providers (when enabled):</strong>{" "}
            <code className="font-mono">api.anthropic.com</code>,{" "}
            <code className="font-mono">api.openai.com</code>,{" "}
            <code className="font-mono">openrouter.ai</code>
          </span>
          <span>
            <strong>Supported sites:</strong>{" "}
            <code className="font-mono">mail.google.com</code>,{" "}
            <code className="font-mono">app.slack.com</code>,{" "}
            <code className="font-mono">linear.app</code>,{" "}
            <code className="font-mono">*.notion.so</code>,{" "}
            <code className="font-mono">*.notion.site</code>,{" "}
            <code className="font-mono">github.com</code>,{" "}
            <code className="font-mono">docs.google.com</code>,{" "}
            <code className="font-mono">outlook.live.com</code>,{" "}
            <code className="font-mono">outlook.office.com</code>,{" "}
            <code className="font-mono">outlook.office365.com</code>
          </span>
        </div>
      </details>
      <p className="m-0 text-fg-muted text-sm">
        The list below shows additional hosts you've granted at runtime (e.g. a
        LAN-hosted LM Studio or Ollama).
      </p>
      {origins.length === 0 ? (
        <p
          className="m-0 text-fg-muted text-sm"
          data-testid="host-permissions-empty"
        >
          No additional hosts granted.
        </p>
      ) : (
        <ul className="m-0 flex flex-col gap-1 p-0">
          {origins.map((o) => (
            <li
              key={o}
              className="flex items-center justify-between gap-2 text-sm"
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
      value: "cloud-google",
      label: "Cloud Google (Gemini)",
      help:
        "Sends text to generativelanguage.googleapis.com via Google's " +
        "OpenAI-compatible endpoint. Default `gemini-3.5-flash` is fast " +
        "and vision-capable. Requires an API key from aistudio.google.com.",
    },
    {
      value: "mock",
      label: "Mock (developer-only)",
      help: "Deterministic placeholder. No model is called.",
    },
  ];

  return (
    <fieldset
      className="border-hairline m-0 flex flex-col gap-2 border p-3"
      data-testid="mode-selector"
    >
      <legend className="text-fg-muted px-1 text-sm font-medium">
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
            <span className="text-fg-muted text-sm">{opt.help}</span>
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
    <fieldset className="border-hairline m-0 flex flex-col gap-2 border p-3">
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Local Ollama
      </legend>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted text-sm">Endpoint URL</span>
        <input
          type="url"
          value={profile.localEndpoint}
          onChange={(e) => void onChange({ localEndpoint: e.target.value })}
          placeholder={OLLAMA_DEFAULT_BASE_URL}
          className="border-hairline bg-bg text-fg border px-2 py-1"
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
    <fieldset className="border-hairline m-0 flex flex-col gap-2 border p-3">
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Local LM Studio
      </legend>
      <p className="m-0 text-fg-muted text-sm">
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
        <summary className="cursor-pointer text-fg-muted text-sm">
          Advanced (custom base URL, optional API key)
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">Base URL</span>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => void onChange({ localEndpoint: e.target.value })}
              placeholder={LMSTUDIO_DEFAULT_BASE_URL}
              className="border-hairline bg-bg text-fg border px-2 py-1"
              data-testid="lmstudio-base-url-input"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">
              API key (only if you put LM Studio behind a reverse proxy)
            </span>
            {hasStoredKey ? (
              <div className="flex items-center gap-2">
                <code
                  className="border-hairline bg-bg-code text-fg border px-2 py-1 text-sm"
                  data-testid="lmstudio-api-key-masked"
                >
                  ••••{last4}
                </code>
                <button
                  type="button"
                  onClick={() => void clearKey()}
                  className="text-fg-accent text-sm underline"
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
                  className="border-hairline bg-bg text-fg flex-1 border px-2 py-1"
                  data-testid="lmstudio-api-key-input"
                />
                <button
                  type="button"
                  onClick={() => void saveKey()}
                  disabled={pendingKey.length === 0}
                  className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-2 py-1 text-sm disabled:opacity-50"
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
  if (providerId === "google") return "AIza…";
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
  if (providerId === "google") {
    return (
      "Default `gemini-2.0-flash` is fast + vision-capable. Every " +
      "Gemini chat model is multimodal — `gemini-pro-latest`, " +
      "`gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3-pro-preview` " +
      "all work. Click Refresh to list every variant your key can " +
      "access. Get a key from aistudio.google.com/app/apikey."
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
  // 0.0.27: per-provider key — reads from `cloudApiKeys[providerId]`,
  // not the shared `cloudApiKey`. So switching from OpenRouter to
  // Google in Settings no longer shows the OpenRouter key under the
  // Google label. Each provider's key persists independently.
  const storedKey = profile.cloudApiKeys[providerId] ?? null;
  const hasStoredKey = storedKey !== null;
  const last4 = storedKey?.slice(-4) ?? "";

  const saveKey = useCallback(async () => {
    if (pendingKey.length === 0) return;
    // Build the next per-provider key map. Other providers' keys
    // stay intact — the whole point of 0.0.27 is that they survive
    // toggling.
    const nextKeys: Record<string, string> = { ...profile.cloudApiKeys };
    nextKeys[providerId] = pendingKey;
    await onChange({
      cloudProvider: providerId,
      cloudModel: profile.cloudModel ?? DEFAULT_MODELS[providerId] ?? "",
      cloudApiKeys: nextKeys,
      // Keep `cloudApiKey` denormalised to the active provider so
      // translation-client + any pre-migration callers that read it
      // directly still work.
      cloudApiKey: pendingKey,
      mode: "cloud" as ExtensionMode,
    });
    setPendingKey("");
  }, [
    onChange,
    pendingKey,
    providerId,
    profile.cloudModel,
    profile.cloudApiKeys,
  ]);

  const clearKey = useCallback(async () => {
    // Only remove THIS provider's key. Other providers' keys survive
    // so switching back to (say) OpenRouter still finds the saved key.
    const nextKeys: Record<string, string> = { ...profile.cloudApiKeys };
    delete nextKeys[providerId];
    await onChange({
      cloudApiKeys: nextKeys,
      cloudApiKey: null,
      mode: "local" as ExtensionMode,
    });
  }, [onChange, providerId, profile.cloudApiKeys]);

  return (
    <fieldset className="border-hairline m-0 flex flex-col gap-2 border p-3">
      <legend className="text-fg-muted px-1 text-sm font-medium">
        Cloud {providerId}
      </legend>
      <ModelPicker
        provider={providerId}
        baseUrl={null}
        apiKey={storedKey}
        currentModel={profile.cloudModel ?? ""}
        defaultModel={DEFAULT_MODELS[providerId] ?? ""}
        modelKey="cloudModel"
        onChange={onChange}
        testIdPrefix="cloud"
      />
      {modelHint(providerId) ? (
        <span className="text-fg-muted text-sm">{modelHint(providerId)}</span>
      ) : null}
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted text-sm">API key</span>
        {hasStoredKey ? (
          <div className="flex items-center gap-2">
            <code
              className="border-hairline bg-bg-code text-fg border px-2 py-1 text-sm"
              data-testid="cloud-api-key-masked"
            >
              ••••{last4}
            </code>
            <button
              type="button"
              onClick={() => void clearKey()}
              className="text-fg-accent text-sm underline"
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
              className="border-hairline bg-bg text-fg flex-1 border px-2 py-1"
              data-testid="cloud-api-key-input"
            />
            <button
              type="button"
              onClick={() => void saveKey()}
              disabled={pendingKey.length === 0}
              className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-2 py-1 text-sm disabled:opacity-50"
              data-testid="cloud-api-key-save"
            >
              Save
            </button>
          </div>
        )}
        <span className="text-fg-muted text-sm">
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
      // 0.0.16: route through the service worker. The popup runs in the
      // chrome-extension:// origin and faces CORS on local-LLM endpoints
      // (LM Studio at localhost:1234 returns no Access-Control-Allow-Origin
      // header); the SW has host_permissions for the configured origin
      // and bypasses CORS. Falls back to a direct fetch when chrome.runtime
      // is absent (unit tests, or future non-extension surfaces).
      const models = await fetchModelsViaWorker({ provider, baseUrl, apiKey });
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
      <span className="text-fg-muted text-sm">Model</span>
      <div className="flex items-center gap-2">
        {showDropdown ? (
          <select
            value={currentModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className="border-hairline bg-bg text-fg flex-1 border px-2 py-1"
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
            className="border-hairline bg-bg text-fg flex-1 border px-2 py-1"
            data-testid={`${testIdPrefix}-model-input`}
          />
        )}
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={state.status === "loading"}
          className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-2 py-1 text-sm disabled:opacity-50"
          data-testid={`${testIdPrefix}-model-refresh`}
        >
          {state.status === "loading" ? "Loading…" : "Refresh models"}
        </button>
      </div>
      {state.status === "ok" && models.length === 0 ? (
        <span className="text-fg-muted text-sm">
          No models found. Load a model first, then try again.
        </span>
      ) : null}
      {state.status === "fail" ? (
        <span
          className="text-warn-fg text-sm"
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
