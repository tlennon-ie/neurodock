import { describe, it, expect } from "vitest";
import {
  translate,
  isCloudMode,
  detectChannelFromUrl,
} from "../../src/lib/translation-client.js";
import { defaultProfile } from "../../src/lib/profile.js";
import type {
  ExtensionProfile,
  TranslationRequest,
} from "../../src/lib/types.js";
import type { Provider } from "../../src/lib/providers/provider.js";

const baseProfile: ExtensionProfile = defaultProfile();

describe("translation-client", () => {
  it("returns a labelled mock response when profile.mode === 'mock'", async () => {
    const mockProfile: ExtensionProfile = { ...baseProfile, mode: "mock" };
    const req: TranslationRequest = {
      tool: "translate_incoming",
      input: { text: "Hey — can we revisit the rollout timeline?" },
      channel: "slack",
    };
    const res = await translate(req, { profile: mockProfile });
    expect(res.ok).toBe(true);
    expect(res.mockMode).toBe(true);
    expect(res.provenance.provider).toBe("mock");
    expect(res.provenance.mode).toBe("local");
    expect(res.data).toBeTruthy();
  });

  it("falls back to a labelled mock when local Ollama is unreachable", async () => {
    const res = await translate(
      { tool: "check_tone", input: { text: "ok" } },
      { profile: baseProfile },
    );
    expect(res.ok).toBe(true);
    expect(res.mockMode).toBe(true);
    expect(res.error).toMatch(/MODEL_UNAVAILABLE/);
  });

  it("rejects cloud-mode calls without a configured provider", async () => {
    const profile: ExtensionProfile = { ...baseProfile, mode: "cloud" };
    const res = await translate(
      { tool: "check_tone", input: { text: "ok" } },
      { profile },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/MISSING_CLOUD_PROVIDER/);
    expect(res.mockMode).toBe(false);
    expect(res.provenance.mode).toBe("cloud");
  });

  it("reports MISSING_CLOUD_KEY when cloud provider is set but no key", async () => {
    const profile: ExtensionProfile = {
      ...baseProfile,
      mode: "cloud",
      cloudProvider: "anthropic",
      cloudModel: "claude-haiku-4-5",
      cloudApiKey: null,
      cloudApiKeys: {},
    };
    const res = await translate(
      { tool: "check_tone", input: { text: "ok" } },
      { profile },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/MISSING_CLOUD_KEY/);
  });

  it("dispatches to providerOverride and parses+validates the response", async () => {
    const validToneOutput = {
      axes: { directness: 60, warmth: 40, urgency: 30 },
      axes_target: null,
      baseline_delta: null,
      flagged_phrases: [],
      suggested_rewrite_hint: null,
      eval_corpus_slice:
        "packages/evals/corpora/translation/check/tone/v0.1.0/general.jsonl",
      model_provenance: {
        mode: "cloud",
        provider: "openai",
        model: "gpt-4o-mini",
      },
    };
    const fakeProvider: Provider = {
      id: "fake",
      async complete() {
        return {
          text: JSON.stringify(validToneOutput),
          provenance: {
            mode: "cloud",
            provider: "openai",
            model: "gpt-4o-mini",
          },
        };
      },
    };
    const profile: ExtensionProfile = {
      ...baseProfile,
      mode: "cloud",
      cloudProvider: "openai",
      cloudModel: "gpt-4o-mini",
      cloudApiKey: "sk-test",
      cloudApiKeys: {},
    };
    const res = await translate(
      { tool: "check_tone", input: { text: "Fix it now." } },
      { profile, providerOverride: fakeProvider },
    );
    expect(res.ok).toBe(true);
    expect(res.error).toBeNull();
    expect(res.provenance.provider).toBe("openai");
  });

  it("surfaces LLM_OUTPUT_VALIDATION_FAILED when the provider returns garbage", async () => {
    const fakeProvider: Provider = {
      id: "fake",
      async complete() {
        return {
          text: '{"explicit_ask": 123}',
          provenance: {
            mode: "cloud",
            provider: "openai",
            model: "gpt-4o-mini",
          },
        };
      },
    };
    const profile: ExtensionProfile = {
      ...baseProfile,
      mode: "cloud",
      cloudProvider: "openai",
      cloudModel: "gpt-4o-mini",
      cloudApiKey: "sk-test",
      cloudApiKeys: {},
    };
    const res = await translate(
      { tool: "translate_incoming", input: { text: "hi" } },
      { profile, providerOverride: fakeProvider },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/LLM_OUTPUT_VALIDATION_FAILED/);
  });

  it("identifies cloud mode via isCloudMode", () => {
    expect(isCloudMode(baseProfile)).toBe(false);
    expect(isCloudMode({ ...baseProfile, mode: "cloud" })).toBe(true);
  });

  it("detects the right channel from each supported site URL", () => {
    expect(detectChannelFromUrl("https://mail.google.com/mail/u/0/")).toBe(
      "email",
    );
    expect(detectChannelFromUrl("https://app.slack.com/client/T0/C0")).toBe(
      "slack",
    );
    expect(detectChannelFromUrl("https://linear.app/team/issue/AB-1")).toBe(
      "linear",
    );
    expect(detectChannelFromUrl("https://github.com/x/y/pull/1")).toBe(
      "github",
    );
    expect(detectChannelFromUrl("https://www.notion.so/page")).toBe("notion");
    expect(detectChannelFromUrl("https://docs.google.com/document/d/x")).toBe(
      "gdocs",
    );
    expect(detectChannelFromUrl("https://outlook.live.com/mail/0/")).toBe(
      "email",
    );
    expect(detectChannelFromUrl("https://example.invalid/")).toBe("generic");
  });
});
