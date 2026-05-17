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

const baseProfile: ExtensionProfile = defaultProfile();

describe("translation-client", () => {
  it("returns a labelled mock response in local mode by default", async () => {
    const req: TranslationRequest = {
      tool: "translate_incoming",
      input: { text: "Hey — can we revisit the rollout timeline?" },
      channel: "slack",
    };
    const res = await translate(req, { profile: baseProfile });
    expect(res.ok).toBe(true);
    expect(res.mockMode).toBe(true);
    expect(res.provenance.provider).toBe("mock");
    expect(res.provenance.mode).toBe("local");
    expect(res.data).toBeTruthy();
  });

  it("produces deterministic mock shapes for every tool", async () => {
    const tools = [
      "translate_incoming",
      "check_tone",
      "rewrite_outgoing",
      "brief_meeting",
    ] as const;
    for (const tool of tools) {
      const res = await translate(
        { tool, input: { text: "hi", transcript: "hi", target_register: "direct", me: "T" } },
        { profile: baseProfile }
      );
      expect(res.tool).toBe(tool);
      expect(res.mockMode).toBe(true);
      expect(res.data).toMatchObject({ model_provenance: { provider: "mock" } });
    }
  });

  it("rejects cloud-mode calls without a configured provider", async () => {
    const profile: ExtensionProfile = { ...baseProfile, mode: "cloud" };
    const res = await translate(
      { tool: "check_tone", input: { text: "ok" } },
      { profile }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/MISSING_CLOUD_PROVIDER/);
    expect(res.mockMode).toBe(false);
    expect(res.provenance.mode).toBe("cloud");
  });

  it("reports CLOUD_NOT_WIRED when cloud is fully configured (v0.0.1 stub)", async () => {
    const profile: ExtensionProfile = {
      ...baseProfile,
      mode: "cloud",
      cloudProvider: "anthropic",
      cloudModel: "claude-sonnet-4.6",
    };
    const res = await translate(
      { tool: "check_tone", input: { text: "ok" } },
      { profile }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/CLOUD_NOT_WIRED/);
  });

  it("identifies cloud mode via isCloudMode", () => {
    expect(isCloudMode(baseProfile)).toBe(false);
    expect(isCloudMode({ ...baseProfile, mode: "cloud" })).toBe(true);
  });

  it("detects the right channel from each supported site URL", () => {
    expect(detectChannelFromUrl("https://mail.google.com/mail/u/0/")).toBe(
      "email"
    );
    expect(detectChannelFromUrl("https://app.slack.com/client/T0/C0")).toBe(
      "slack"
    );
    expect(detectChannelFromUrl("https://linear.app/team/issue/AB-1")).toBe(
      "linear"
    );
    expect(detectChannelFromUrl("https://github.com/x/y/pull/1")).toBe(
      "github"
    );
    expect(detectChannelFromUrl("https://www.notion.so/page")).toBe("notion");
    expect(detectChannelFromUrl("https://docs.google.com/document/d/x")).toBe(
      "gdocs"
    );
    expect(detectChannelFromUrl("https://outlook.live.com/mail/0/")).toBe(
      "email"
    );
    expect(detectChannelFromUrl("https://example.invalid/")).toBe("generic");
  });
});
