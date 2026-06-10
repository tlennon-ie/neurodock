/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Onboarding wizard — identity-first flow (Tasks E1+E2+E3).
 *
 * Three linear steps:
 *
 *   1. identity — "How you read best": ReaderPreferences (lite) + ReaderFontSwitcher.
 *      Continue persists the reader-prefs draft; Skip persists onboardingComplete.
 *
 *   2. model   — "Connect a model": auto-detects a running local model. If found,
 *      offers a one-tap "Connect (local, private)" button. If not, shows a minimal
 *      cloud API-key input. Model is OPTIONAL — translation works in mock/local
 *      until configured. Skip advances to done without configuring.
 *
 *   3. done    — "You're set": PowerUpCard + "translation works now" line + Finish.
 *      Finish persists onboardingComplete: true and returns to home.
 *
 * Hard contract (preserved from old wizard):
 *   - outer wrapper: data-testid="onboarding-wizard"
 *   - completion: calls onChange({ onboardingComplete: true }) then onComplete()
 *   - App passes: profile, onChange, onComplete, onOpenSettings
 *   - App gate: profile.onboardingComplete !== true shows the wizard
 */
import React, { useCallback, useEffect, useState } from "react";
import type { ExtensionProfile } from "../../src/lib/types.js";
import { ReaderPreferences } from "../../src/components/ReaderPreferences.js";
import { ReaderFontSwitcher } from "../../src/components/ReaderFontSwitcher.js";
import { PowerUpCard } from "../../src/components/PowerUpCard.js";
import {
  detectLocalModel,
  type DetectedLocalModel,
} from "../../src/lib/detect-local-model.js";

type WizardStep = "identity" | "model" | "done";

type ReaderPrefsDraft = Pick<
  ExtensionProfile,
  "neurotypes" | "outputFormat" | "maxChunkSize" | "additionalNotes"
>;

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
  onOpenSettings: _onOpenSettings,
}: OnboardingWizardProps): React.ReactElement {
  const [step, setStep] = useState<WizardStep>("identity");

  // reader-prefs draft — staged here and flushed on identity Continue
  const [prefsDraft, setPrefsDraft] = useState<ReaderPrefsDraft>({
    neurotypes: profile.neurotypes,
    outputFormat: profile.outputFormat,
    maxChunkSize: profile.maxChunkSize,
    additionalNotes: profile.additionalNotes,
  });

  // model-step draft
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudProvider, setCloudProvider] = useState<
    "anthropic" | "openai" | "openrouter" | "google"
  >("anthropic");

  const complete = useCallback(
    async (extra?: Partial<ExtensionProfile>): Promise<void> => {
      await onChange({ ...extra, onboardingComplete: true });
      onComplete();
    },
    [onChange, onComplete],
  );

  // ── identity handlers ────────────────────────────────────────────────

  const handleIdentityContinue = useCallback(async (): Promise<void> => {
    await onChange({ ...prefsDraft });
    setStep("model");
  }, [onChange, prefsDraft]);

  const handleIdentitySkip = useCallback(async (): Promise<void> => {
    await complete();
  }, [complete]);

  // ── model handlers ───────────────────────────────────────────────────

  const handleModelSkip = useCallback((): void => {
    setStep("done");
  }, []);

  const handleModelBack = useCallback((): void => {
    setStep("identity");
  }, []);

  // ── done handler ─────────────────────────────────────────────────────

  const handleFinish = useCallback(async (): Promise<void> => {
    await complete();
  }, [complete]);

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
        <ProgressDots step={step} />
      </header>

      {step === "identity" ? (
        <IdentityStep
          draft={prefsDraft}
          onChangeDraft={(patch) =>
            setPrefsDraft((prev) => ({ ...prev, ...patch }))
          }
          onContinue={() => void handleIdentityContinue()}
          onSkip={() => void handleIdentitySkip()}
        />
      ) : null}

      {step === "model" ? (
        <ModelStep
          cloudApiKey={cloudApiKey}
          cloudProvider={cloudProvider}
          onCloudApiKeyChange={setCloudApiKey}
          onCloudProviderChange={setCloudProvider}
          onChange={onChange}
          onBack={handleModelBack}
          onSkip={handleModelSkip}
          onAdvanceToDone={() => setStep("done")}
        />
      ) : null}

      {step === "done" ? (
        <DoneStep onFinish={() => void handleFinish()} />
      ) : null}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Progress indicator
// ──────────────────────────────────────────────────────────────────────

const STEP_ORDER: ReadonlyArray<WizardStep> = ["identity", "model", "done"];

interface ProgressDotsProps {
  readonly step: WizardStep;
}

function ProgressDots({ step }: ProgressDotsProps): React.ReactElement {
  const current = STEP_ORDER.indexOf(step) + 1;
  const total = STEP_ORDER.length;
  return (
    <p
      className="text-fg-muted m-0 text-sm"
      data-testid="wizard-progress"
      aria-label={`Step ${current} of ${total}`}
    >
      {`${current} of ${total}`}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 1 — Identity ("How you read best")
// ──────────────────────────────────────────────────────────────────────

type ReaderPrefsPatch = Partial<
  Pick<
    ExtensionProfile,
    "neurotypes" | "outputFormat" | "maxChunkSize" | "additionalNotes"
  >
>;

interface IdentityStepProps {
  readonly draft: ReaderPrefsDraft;
  readonly onChangeDraft: (patch: ReaderPrefsPatch) => void;
  readonly onContinue: () => void;
  readonly onSkip: () => void;
}

function IdentityStep({
  draft,
  onChangeDraft,
  onContinue,
  onSkip,
}: IdentityStepProps): React.ReactElement {
  return (
    <div data-testid="wizard-step-identity" className="flex flex-col gap-3">
      <p className="text-fg m-0 text-sm">
        NeuroDock shapes every translation to how you read. These are optional
        and can be changed at any time in Settings.
      </p>
      <ReaderPreferences
        variant="lite"
        value={draft}
        onChange={onChangeDraft}
      />
      <ReaderFontSwitcher />
      <StepFooter
        primary={{
          label: "Continue",
          onClick: onContinue,
          testId: "wizard-identity-continue",
        }}
        skip={{ onClick: onSkip, testId: "wizard-identity-skip" }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 2 — Model ("Connect a model")
// ──────────────────────────────────────────────────────────────────────

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

interface ModelStepProps {
  readonly cloudApiKey: string;
  readonly cloudProvider: "anthropic" | "openai" | "openrouter" | "google";
  readonly onCloudApiKeyChange: (key: string) => void;
  readonly onCloudProviderChange: (
    provider: "anthropic" | "openai" | "openrouter" | "google",
  ) => void;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly onAdvanceToDone: () => void;
}

function ModelStep({
  cloudApiKey,
  cloudProvider,
  onCloudApiKeyChange,
  onCloudProviderChange,
  onChange,
  onBack,
  onSkip,
  onAdvanceToDone,
}: ModelStepProps): React.ReactElement {
  const [detected, setDetected] = useState<
    DetectedLocalModel | null | "checking"
  >("checking");

  useEffect(() => {
    let cancelled = false;
    void detectLocalModel().then((result) => {
      if (!cancelled) setDetected(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnectLocal = useCallback(async (): Promise<void> => {
    if (detected === "checking" || detected === null) return;
    await onChange({
      mode: "local",
      localProvider: detected.provider,
      localEndpoint: detected.endpoint,
    });
    onAdvanceToDone();
  }, [detected, onChange, onAdvanceToDone]);

  const handleConnectCloud = useCallback(async (): Promise<void> => {
    if (cloudApiKey.length > 0) {
      const nextKeys: Record<string, string> = { [cloudProvider]: cloudApiKey };
      await onChange({
        mode: "cloud",
        cloudProvider,
        cloudModel: CLOUD_DEFAULT_MODELS[cloudProvider] ?? null,
        cloudApiKeys: nextKeys,
        cloudApiKey,
      });
    }
    onAdvanceToDone();
  }, [cloudApiKey, cloudProvider, onChange, onAdvanceToDone]);

  return (
    <div data-testid="wizard-step-model" className="flex flex-col gap-3">
      <p className="text-fg m-0 text-sm">
        Connect a model to power translations. This step is optional — NeuroDock
        works in local mode until you configure one.
      </p>

      {detected === "checking" ? (
        <p className="text-fg-muted m-0 text-sm">Checking for a local model…</p>
      ) : detected !== null ? (
        /* Local model detected — one-tap connect */
        <div className="border-hairline bg-bg-nav flex flex-col gap-2 border p-3">
          <p className="text-fg m-0 text-sm font-medium">
            {detected.provider === "lmstudio" ? "LM Studio" : "Ollama"} detected
            on this machine.
          </p>
          <p className="text-fg-muted m-0 text-sm">
            Text stays on your device. No API key needed.
          </p>
          <button
            type="button"
            onClick={() => void handleConnectLocal()}
            className="border-accent bg-bg text-fg-accent hover:bg-bg-nav self-start border px-3 py-1 text-sm font-medium"
            data-testid="wizard-model-connect-local"
          >
            Connect (local, private)
          </button>
        </div>
      ) : (
        /* No local model — simple cloud fallback */
        <fieldset className="border-hairline m-0 flex flex-col gap-2 border p-3">
          <legend className="text-fg-muted px-1 text-sm font-medium">
            Cloud provider (optional)
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">Provider</span>
            <select
              value={cloudProvider}
              onChange={(e) => {
                const next = e.target.value as
                  | "anthropic"
                  | "openai"
                  | "openrouter"
                  | "google";
                onCloudProviderChange(next);
              }}
              className="border-hairline bg-bg text-fg border px-2 py-1 text-sm"
              data-testid="wizard-cloud-provider-select"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="google">Google (Gemini)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted text-sm">API key</span>
            <input
              type="password"
              value={cloudApiKey}
              onChange={(e) => onCloudApiKeyChange(e.target.value)}
              placeholder={CLOUD_KEY_PLACEHOLDERS[cloudProvider] ?? "sk-…"}
              autoComplete="off"
              spellCheck={false}
              className="border-hairline bg-bg text-fg border px-2 py-1"
              data-testid="wizard-cloud-key"
            />
          </label>
          <p className="text-fg-muted m-0 text-sm">
            Stored on this device only. Never synced.
          </p>
          {cloudApiKey.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleConnectCloud()}
              className="border-accent bg-bg text-fg-accent hover:bg-bg-nav self-start border px-3 py-1 text-sm font-medium"
              data-testid="wizard-model-connect-cloud"
            >
              Connect
            </button>
          ) : null}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-fg-muted hover:text-fg px-2 py-1 text-sm underline"
          data-testid="wizard-model-back"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-fg-muted hover:text-fg ml-auto px-2 py-1 text-sm underline"
          data-testid="wizard-model-skip"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Step 3 — Done ("You're set")
// ──────────────────────────────────────────────────────────────────────

interface DoneStepProps {
  readonly onFinish: () => void;
}

function DoneStep({ onFinish }: DoneStepProps): React.ReactElement {
  return (
    <div data-testid="wizard-step-done" className="flex flex-col gap-3">
      <PowerUpCard />
      <p className="text-fg m-0 text-sm">
        You're set — translation works now. Right-click any selected text or
        image on a supported site (Gmail, Slack, Linear, Notion, GitHub, Google
        Docs, Outlook) to try it.
      </p>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onFinish}
          className="border-accent bg-bg text-fg-accent hover:bg-bg-nav border px-3 py-1 text-sm font-medium"
          data-testid="wizard-finish"
        >
          Finish
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared footer used by the identity step.
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
