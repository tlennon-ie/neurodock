/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Guided onboarding wizard (Roadmap A1).
 *
 * Renders in place of the regular popup layout when
 * `profile.onboardingComplete !== true` AND the user has not yet
 * configured any provider. Five linear steps:
 *
 *   1. Welcome           — one paragraph in plain language.
 *   2. Provider select   — three cards: LM Studio, Ollama, Cloud.
 *   3. Provider config   — branched per choice. Validate the config
 *                          with a real models or models-endpoint ping.
 *   4. Profile sync      — surface native-host sync if installed;
 *                          show the install hint otherwise. Skippable.
 *   5. Done              — sets `onboardingComplete: true` on the
 *                          profile and hands control back to App.tsx.
 *
 * Hard contract:
 *   - Every step except step 3 (Provider configuration) has a "Skip for
 *     now" affordance. Skipping advances without writing anything to
 *     the profile, so the user can come back later via Settings.
 *   - Existing users with a provider already configured never reach
 *     this component (the migration guard in `normaliseProfile()`
 *     stamps `onboardingComplete: true` for them).
 *   - No new colours; reuse the 0.0.32 tokens via the existing Tailwind
 *     utility aliases (`bg-bg`, `text-fg`, `border-hairline`, …).
 *   - No new dependencies, no analytics, no telemetry. The wizard
 *     reads and writes the same `chrome.storage.local` keys as the
 *     rest of the popup.
 */
import React, { useCallback, useEffect, useState } from "react";
import type { ExtensionMode, ExtensionProfile } from "../../src/lib/types.js";
import {
  getSyncStatus,
  type ProfileSyncStatus,
} from "../../src/lib/profile.js";
import { fetchModelsViaWorker } from "../../src/lib/fetch-models-via-worker.js";

type WizardStep = 1 | 2 | 3 | 4 | 5;

type ProviderChoice =
  | "local-lmstudio"
  | "local-ollama"
  | "cloud-anthropic"
  | "cloud-openai"
  | "cloud-openrouter"
  | "cloud-google";

const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";
const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

const CLOUD_KEY_PLACEHOLDERS: Record<string, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
  openrouter: "sk-or-…",
  google: "AIza…",
};

const CLOUD_DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  openrouter: "openrouter/auto",
  google: "gemini-2.0-flash",
};

export interface OnboardingWizardProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
  readonly onComplete: () => void;
  readonly onOpenSettings: () => void;
}

export function OnboardingWizard({
  profile,
  onChange,
  onComplete,
  onOpenSettings,
}: OnboardingWizardProps): React.ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [choice, setChoice] = useState<ProviderChoice | null>(null);

  const go = useCallback((next: WizardStep) => {
    setStep(next);
  }, []);

  const finish = useCallback(async (): Promise<void> => {
    await onChange({ onboardingComplete: true });
    onComplete();
  }, [onChange, onComplete]);

  return (
    <section
      aria-labelledby="wizard-heading"
      data-testid="onboarding-wizard"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="wizard-heading"
          className="font-heading text-fg m-0 text-base font-medium"
        >
          Welcome to NeuroDock
        </h2>
        <ProgressDots step={step} total={5} />
      </header>

      {step === 1 ? (
        <WelcomeStep onContinue={() => go(2)} onSkip={() => void finish()} />
      ) : null}

      {step === 2 ? (
        <ProviderSelectStep
          choice={choice}
          onChoose={(next) => {
            setChoice(next);
          }}
          onBack={() => go(1)}
          onContinue={() => {
            if (choice !== null) go(3);
          }}
          onSkip={() => void finish()}
        />
      ) : null}

      {step === 3 && choice !== null ? (
        <ProviderConfigStep
          choice={choice}
          profile={profile}
          onChange={onChange}
          onBack={() => go(2)}
          onContinue={() => go(4)}
        />
      ) : null}

      {step === 4 ? (
        <SyncStep
          onBack={() => go(3)}
          onContinue={() => go(5)}
          onSkip={() => go(5)}
        />
      ) : null}

      {step === 5 ? (
        <DoneStep
          onOpenSettings={() => {
            void finish().then(() => onOpenSettings());
          }}
          onReturnHome={() => void finish()}
          onBack={() => go(4)}
        />
      ) : null}
    </section>
  );
}

interface ProgressDotsProps {
  readonly step: WizardStep;
  readonly total: number;
}

function ProgressDots({ step, total }: ProgressDotsProps): React.ReactElement {
  return (
    <p
      className="text-fg-muted m-0 text-sm"
      data-testid="wizard-progress"
      aria-label={`Step ${step} of ${total}`}
    >
      {`${step} of ${total}`}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 1 — Welcome.
// ──────────────────────────────────────────────────────────────────────

interface WelcomeStepProps {
  readonly onContinue: () => void;
  readonly onSkip: () => void;
}

function WelcomeStep({
  onContinue,
  onSkip,
}: WelcomeStepProps): React.ReactElement {
  return (
    <div data-testid="wizard-step-welcome" className="flex flex-col gap-3">
      <p className="text-fg m-0 text-sm">
        NeuroDock translates messages, decodes images, and pauses you when
        you've been at the screen too long. It runs locally on your machine by
        default; cloud is opt-in.
      </p>
      <p className="text-fg-muted m-0 text-sm">
        This three-minute setup picks where translation runs and verifies the
        connection. You can change everything later in Settings.
      </p>
      <StepFooter
        primary={{
          label: "Continue",
          onClick: onContinue,
          testId: "wizard-welcome-continue",
        }}
        skip={{ onClick: onSkip, testId: "wizard-welcome-skip" }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 2 — Provider selection.
// ──────────────────────────────────────────────────────────────────────

interface ProviderSelectStepProps {
  readonly choice: ProviderChoice | null;
  readonly onChoose: (next: ProviderChoice) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onSkip: () => void;
}

interface ProviderCard {
  readonly value: ProviderChoice;
  readonly title: string;
  readonly pros: string;
  readonly cons: string;
  readonly testId: string;
}

const PROVIDER_CARDS: ReadonlyArray<ProviderCard> = [
  {
    value: "local-lmstudio",
    title: "Local — LM Studio",
    pros: "Recommended for privacy. Text never leaves your device.",
    cons: "Requires LM Studio running with a model loaded.",
    testId: "wizard-provider-lmstudio",
  },
  {
    value: "local-ollama",
    title: "Local — Ollama",
    pros: "Recommended for privacy. Text never leaves your device.",
    cons: "Requires the Ollama daemon running with a model pulled.",
    testId: "wizard-provider-ollama",
  },
  {
    value: "cloud-anthropic",
    title: "Cloud — Anthropic / OpenAI / OpenRouter / Google",
    pros: "Recommended for low-spec machines. No local model needed.",
    cons: "Costs apply. Text leaves your device to the provider you pick.",
    testId: "wizard-provider-cloud",
  },
];

function ProviderSelectStep({
  choice,
  onChoose,
  onBack,
  onContinue,
  onSkip,
}: ProviderSelectStepProps): React.ReactElement {
  const [cloudProvider, setCloudProvider] = useState<
    "anthropic" | "openai" | "openrouter" | "google"
  >("anthropic");

  return (
    <div
      data-testid="wizard-step-provider-select"
      className="flex flex-col gap-3"
    >
      <p className="text-fg m-0 text-sm">
        Pick where translation runs. You can change this later in Settings.
      </p>
      <fieldset
        className="border-hairline m-0 flex flex-col gap-2 border p-3"
        aria-labelledby="wizard-provider-legend"
      >
        <legend
          id="wizard-provider-legend"
          className="text-fg-muted px-1 text-sm font-medium"
        >
          Provider
        </legend>
        {PROVIDER_CARDS.map((card) => {
          const isCloud = card.value === "cloud-anthropic";
          const checked = isCloud
            ? choice === "cloud-anthropic" ||
              choice === "cloud-openai" ||
              choice === "cloud-openrouter" ||
              choice === "cloud-google"
            : choice === card.value;
          const onSelect = (): void => {
            if (isCloud) {
              onChoose(`cloud-${cloudProvider}` as ProviderChoice);
            } else {
              onChoose(card.value);
            }
          };
          return (
            <label
              key={card.value}
              className="flex items-start gap-2 text-sm"
              data-testid={card.testId}
            >
              <input
                type="radio"
                name="wizard-provider"
                checked={checked}
                onChange={onSelect}
                className="mt-1"
                data-testid={`${card.testId}-radio`}
              />
              <span className="flex flex-col">
                <span className="font-medium">{card.title}</span>
                <span className="text-fg-muted text-sm">{card.pros}</span>
                <span className="text-fg-muted text-sm">{card.cons}</span>
                {isCloud && checked ? (
                  <select
                    value={cloudProvider}
                    onChange={(e) => {
                      const next = e.target.value as
                        | "anthropic"
                        | "openai"
                        | "openrouter"
                        | "google";
                      setCloudProvider(next);
                      onChoose(`cloud-${next}` as ProviderChoice);
                    }}
                    className="border-hairline bg-bg text-fg mt-2 self-start border px-2 py-0.5 text-sm"
                    data-testid="wizard-cloud-provider-select"
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="google">Google (Gemini)</option>
                  </select>
                ) : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <StepFooter
        primary={{
          label: "Continue",
          onClick: onContinue,
          testId: "wizard-provider-continue",
          disabled: choice === null,
        }}
        back={{ onClick: onBack, testId: "wizard-provider-back" }}
        skip={{ onClick: onSkip, testId: "wizard-provider-skip" }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 3 — Provider configuration.
// ──────────────────────────────────────────────────────────────────────

interface ProviderConfigStepProps {
  readonly choice: ProviderChoice;
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

type TestState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly models: readonly string[] }
  | { readonly status: "fail"; readonly message: string };

function ProviderConfigStep({
  choice,
  profile,
  onChange,
  onBack,
  onContinue,
}: ProviderConfigStepProps): React.ReactElement {
  const isLocal = choice === "local-lmstudio" || choice === "local-ollama";
  const cloudProviderId = isLocal
    ? null
    : (choice.replace(/^cloud-/, "") as
        | "anthropic"
        | "openai"
        | "openrouter"
        | "google");

  // Local state for the wizard's own fields — we stage everything and
  // write to the profile only on Continue, so the user can change their
  // mind without persisting a half-configured provider.
  const initialBaseUrl =
    choice === "local-lmstudio"
      ? LMSTUDIO_DEFAULT_BASE_URL
      : OLLAMA_DEFAULT_BASE_URL;
  const [baseUrl, setBaseUrl] = useState<string>(isLocal ? initialBaseUrl : "");
  const [model, setModel] = useState<string>(() => {
    if (cloudProviderId !== null) {
      return CLOUD_DEFAULT_MODELS[cloudProviderId] ?? "";
    }
    return profile.localModel || "";
  });
  const [apiKey, setApiKey] = useState<string>("");
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const onTest = useCallback(async () => {
    setTest({ status: "loading" });
    try {
      const models = await fetchModelsViaWorker({
        provider: isLocal
          ? choice === "local-lmstudio"
            ? "lmstudio"
            : "ollama"
          : (cloudProviderId as
              | "anthropic"
              | "openai"
              | "openrouter"
              | "google"),
        baseUrl: isLocal ? baseUrl : null,
        apiKey: isLocal ? null : apiKey,
      });
      setTest({ status: "ok", models });
      if (model.length === 0 && models.length > 0) {
        const first = models[0];
        if (typeof first === "string") setModel(first);
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Unknown error";
      setTest({ status: "fail", message });
    }
  }, [apiKey, baseUrl, choice, cloudProviderId, isLocal, model.length]);

  const onContinueClick = useCallback(async () => {
    if (isLocal) {
      await onChange({
        mode: "local" as ExtensionMode,
        localProvider: choice === "local-lmstudio" ? "lmstudio" : "ollama",
        localEndpoint: baseUrl,
        ...(model.length > 0 ? { localModel: model } : {}),
        cloudProvider: null,
      });
    } else if (cloudProviderId !== null) {
      const nextKeys: Record<string, string> = { ...profile.cloudApiKeys };
      if (apiKey.length > 0) {
        nextKeys[cloudProviderId] = apiKey;
      }
      await onChange({
        cloudProvider: cloudProviderId,
        cloudModel:
          model.length > 0
            ? model
            : CLOUD_DEFAULT_MODELS[cloudProviderId] ?? null,
        cloudApiKeys: nextKeys,
        ...(apiKey.length > 0 ? { cloudApiKey: apiKey } : {}),
        mode: apiKey.length > 0 ? ("cloud" as ExtensionMode) : profile.mode,
      });
    }
    onContinue();
  }, [
    apiKey,
    baseUrl,
    choice,
    cloudProviderId,
    isLocal,
    model,
    onChange,
    onContinue,
    profile.cloudApiKeys,
    profile.mode,
  ]);

  const canContinue = test.status === "ok";

  return (
    <div data-testid="wizard-step-config" className="flex flex-col gap-3">
      {isLocal ? (
        <fieldset className="border-hairline m-0 flex flex-col gap-2 border p-3">
          <legend className="text-fg-muted px-1 text-sm font-medium">
            {choice === "local-lmstudio" ? "Local LM Studio" : "Local Ollama"}
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">Endpoint URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={initialBaseUrl}
              className="border-hairline bg-bg text-fg border px-2 py-1"
              data-testid="wizard-local-endpoint"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">
              Model (auto-fills after a successful test)
            </span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. llama3.2:3b"
              className="border-hairline bg-bg text-fg border px-2 py-1"
              data-testid="wizard-local-model"
            />
          </label>
        </fieldset>
      ) : (
        <fieldset className="border-hairline m-0 flex flex-col gap-2 border p-3">
          <legend className="text-fg-muted px-1 text-sm font-medium">
            Cloud {cloudProviderId}
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                cloudProviderId
                  ? CLOUD_KEY_PLACEHOLDERS[cloudProviderId] ?? "sk-…"
                  : "sk-…"
              }
              autoComplete="off"
              spellCheck={false}
              className="border-hairline bg-bg text-fg border px-2 py-1"
              data-testid="wizard-cloud-key"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">
              Model (auto-fills after a successful test)
            </span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border-hairline bg-bg text-fg border px-2 py-1"
              data-testid="wizard-cloud-model"
            />
          </label>
          <p className="text-fg-muted m-0 text-sm">
            The key is stored on this device only via{" "}
            <code className="font-mono">chrome.storage.local</code>. Never
            synced.
          </p>
        </fieldset>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onTest()}
          disabled={test.status === "loading"}
          className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-3 py-1 text-sm disabled:opacity-50"
          data-testid="wizard-test-connection"
        >
          {test.status === "loading" ? "Testing…" : "Test connection"}
        </button>
        <span role="status" aria-live="polite" className="text-sm">
          {test.status === "ok" ? (
            <span className="text-fg-accent" data-testid="wizard-test-ok">
              OK — found {test.models.length} model
              {test.models.length === 1 ? "" : "s"}.
            </span>
          ) : null}
          {test.status === "fail" ? (
            <span className="text-warn-fg" data-testid="wizard-test-fail">
              Failed: {test.message}
            </span>
          ) : null}
        </span>
      </div>
      {!canContinue ? (
        <p className="text-fg-muted m-0 text-sm">
          Run a successful test to continue. The wizard needs to verify the
          provider before saving.
        </p>
      ) : null}
      <StepFooter
        primary={{
          label: "Continue",
          onClick: () => void onContinueClick(),
          testId: "wizard-config-continue",
          disabled: !canContinue,
        }}
        back={{ onClick: onBack, testId: "wizard-config-back" }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 4 — Profile sync.
// ──────────────────────────────────────────────────────────────────────

interface SyncStepProps {
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onSkip: () => void;
}

function SyncStep({
  onBack,
  onContinue,
  onSkip,
}: SyncStepProps): React.ReactElement {
  const [status, setStatus] = useState<ProfileSyncStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getSyncStatus();
        if (cancelled) return;
        setStatus(s);
      } catch {
        if (cancelled) return;
        setStatus(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="wizard-step-sync" className="flex flex-col gap-3">
      <h3 className="font-heading text-fg m-0 text-base font-medium">
        Profile sync
      </h3>
      {!loaded ? (
        <p className="text-fg-muted m-0 text-sm">
          Checking for the native messaging host…
        </p>
      ) : status?.source === "native-host" ? (
        <div className="text-fg-muted flex flex-col gap-0.5 text-sm">
          <span>
            <strong>Native host active.</strong> NeuroDock will read and write{" "}
            <code className="font-mono">~/.neurodock/profile.yaml</code> so this
            extension stays in sync with the CLI.
          </span>
          {status.detail ? <span>{status.detail}</span> : null}
        </div>
      ) : (
        <div className="border-hairline bg-bg-nav text-fg flex flex-col gap-1 border p-2 text-sm">
          <span>
            <strong>Extension-local.</strong> Your profile lives only inside
            this browser. That is a sound default; you can install the optional
            native host later to share settings with the CLI.
          </span>
          <code
            className="bg-bg-code border-hairline select-all border px-2 py-1 font-mono"
            data-testid="wizard-sync-install-hint"
          >
            pnpx @neurodock/native-host install
          </code>
        </div>
      )}
      <StepFooter
        primary={{
          label: "Continue",
          onClick: onContinue,
          testId: "wizard-sync-continue",
        }}
        back={{ onClick: onBack, testId: "wizard-sync-back" }}
        skip={{ onClick: onSkip, testId: "wizard-sync-skip" }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 5 — Done.
// ──────────────────────────────────────────────────────────────────────

interface DoneStepProps {
  readonly onOpenSettings: () => void;
  readonly onReturnHome: () => void;
  readonly onBack: () => void;
}

function DoneStep({
  onOpenSettings,
  onReturnHome,
  onBack,
}: DoneStepProps): React.ReactElement {
  return (
    <div data-testid="wizard-step-done" className="flex flex-col gap-3">
      <p className="text-fg m-0 text-sm">
        Setup is complete. NeuroDock is ready to translate. Right-click any
        selected text or image on a supported site (Gmail, Slack, Linear,
        Notion, GitHub, Google Docs, Outlook) to try it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="border-hairline bg-bg text-fg hover:bg-bg-nav border px-3 py-1 text-sm"
          data-testid="wizard-done-open-settings"
        >
          Open Settings
        </button>
        <button
          type="button"
          onClick={onReturnHome}
          className="border-accent bg-bg text-fg-accent hover:bg-bg-nav border px-3 py-1 text-sm font-medium"
          data-testid="wizard-done-translate"
        >
          Translate something
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-fg-muted hover:text-fg ml-auto px-2 py-1 text-sm underline"
          data-testid="wizard-done-back"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared footer used by every step except Done.
// ──────────────────────────────────────────────────────────────────────

interface StepFooterButton {
  readonly label?: string;
  readonly onClick: () => void;
  readonly testId: string;
  readonly disabled?: boolean;
}

interface StepFooterProps {
  readonly primary: StepFooterButton;
  readonly back?: StepFooterButton;
  readonly skip?: StepFooterButton;
}

function StepFooter({
  primary,
  back,
  skip,
}: StepFooterProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          className="text-fg-muted hover:text-fg px-2 py-1 text-sm underline"
          data-testid={back.testId}
        >
          {back.label ?? "Back"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled === true}
        className="border-accent bg-bg text-fg-accent hover:bg-bg-nav border px-3 py-1 text-sm font-medium disabled:opacity-50"
        data-testid={primary.testId}
      >
        {primary.label ?? "Continue"}
      </button>
      {skip ? (
        <button
          type="button"
          onClick={skip.onClick}
          className="text-fg-muted hover:text-fg ml-auto px-2 py-1 text-sm underline"
          data-testid={skip.testId}
        >
          {skip.label ?? "Skip for now"}
        </button>
      ) : null}
    </div>
  );
}
