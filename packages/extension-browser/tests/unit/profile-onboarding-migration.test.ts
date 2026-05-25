/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Roadmap A1 migration guard.
 *
 * `normaliseProfile()` must:
 *   - Default `onboardingComplete: false` for a brand-new profile (so
 *     the wizard renders on first popup open).
 *   - Stamp `onboardingComplete: true` for any pre-A1 profile that
 *     already has a provider configured (cloud key set OR a
 *     non-default local endpoint OR a cloud provider id set), so an
 *     upgrade never re-shows the wizard to an existing user.
 *   - Honour an explicit boolean if the key is already present.
 */
import { describe, it, expect } from "vitest";
import { normaliseProfile } from "../../src/lib/profile.js";

describe("profile onboarding migration (Roadmap A1)", () => {
  it("returns onboardingComplete: false for a brand-new empty profile", () => {
    const profile = normaliseProfile({});
    expect(profile.onboardingComplete).toBe(false);
  });

  it("returns onboardingComplete: false when only defaults are stored", () => {
    const profile = normaliseProfile({
      mode: "local",
      localProvider: "ollama",
      localEndpoint: "http://localhost:11434",
      localModel: "llama3.2:3b",
      cloudProvider: null,
      cloudApiKey: null,
      cloudApiKeys: {},
    });
    expect(profile.onboardingComplete).toBe(false);
  });

  it("infers true when a cloud provider id is already set", () => {
    const profile = normaliseProfile({
      cloudProvider: "anthropic",
    });
    expect(profile.onboardingComplete).toBe(true);
  });

  it("infers true when the legacy single cloud key is set", () => {
    const profile = normaliseProfile({
      cloudApiKey: "sk-ant-abc",
    });
    expect(profile.onboardingComplete).toBe(true);
  });

  it("infers true when any per-provider cloud key is present", () => {
    const profile = normaliseProfile({
      cloudApiKeys: { openrouter: "sk-or-yyy" },
    });
    expect(profile.onboardingComplete).toBe(true);
  });

  it("infers true when the local endpoint is customised away from the Ollama default", () => {
    const profile = normaliseProfile({
      localProvider: "ollama",
      localEndpoint: "http://192.168.1.5:11434",
    });
    expect(profile.onboardingComplete).toBe(true);
  });

  it("infers true when the local endpoint is customised away from the LM Studio default", () => {
    const profile = normaliseProfile({
      localProvider: "lmstudio",
      localEndpoint: "http://10.0.0.4:1234/v1",
    });
    expect(profile.onboardingComplete).toBe(true);
  });

  it("does NOT infer true when the LM Studio default endpoint is set explicitly", () => {
    const profile = normaliseProfile({
      localProvider: "lmstudio",
      localEndpoint: "http://localhost:1234/v1",
    });
    expect(profile.onboardingComplete).toBe(false);
  });

  it("honours an explicit onboardingComplete: true", () => {
    const profile = normaliseProfile({
      onboardingComplete: true,
    });
    expect(profile.onboardingComplete).toBe(true);
  });

  it("honours an explicit onboardingComplete: false even with a provider configured", () => {
    // Explicit false is rare but should be respected — it means the
    // user (or a future settings-tab toggle) is forcing the wizard to
    // re-appear.
    const profile = normaliseProfile({
      onboardingComplete: false,
      cloudProvider: "anthropic",
    });
    expect(profile.onboardingComplete).toBe(false);
  });
});
