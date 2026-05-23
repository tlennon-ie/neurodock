/**
 * Unit tests for:
 *   - entrypoints/_shared/mountIsland.ts  — mountIsland()
 *   - entrypoints/_shared/bootstrap.tsx   — bootstrapContent()
 *
 * TDD: written as the first test file covering these modules (P1 item #9).
 *
 * Strategy:
 *  - ContentApp is fully mocked so we can capture every set of props passed
 *    to it across re-renders without rendering real React trees.
 *  - chrome.runtime.sendMessage and chrome.storage.onChanged are overridden
 *    per test; the global chrome shim from setup.ts provides the baseline.
 *  - All tests clean up the DOM after themselves to stay independent.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import React from "react";
import { act } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Must be declared before the dynamic import of bootstrap so the factory
// runs first and the module graph sees the mock from the start.
vi.mock("../../entrypoints/_shared/contentApp.js", () => ({
  ContentApp: vi.fn(() => null),
}));

// We import after vi.mock so we always get the mocked version.
import { ContentApp } from "../../entrypoints/_shared/contentApp.js";
import { mountIsland } from "../../entrypoints/_shared/mountIsland.js";
import { bootstrapContent } from "../../entrypoints/_shared/bootstrap.js";
import type {
  ContentAppProps,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
} from "../../entrypoints/_shared/contentApp.js";
import type {
  ExtensionProfile,
  TranslationResponse,
  TranslationRequest,
  RuntimeResponseEnvelope,
} from "../../src/lib/types.js";

// Typed alias for the mock so we can read `.mock.calls` with proper types.
const MockContentApp = ContentApp as unknown as MockInstance;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildProfile(
  overrides: Partial<ExtensionProfile> = {},
): ExtensionProfile {
  return {
    mode: "local",
    localProvider: "ollama",
    localEndpoint: "http://localhost:11434",
    localModel: "llama3.2:3b",
    localApiKey: null,
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    historyEnabled: false,
    displayName: "you",
    ...overrides,
  };
}

// ─── mountIsland ─────────────────────────────────────────────────────────────

describe("mountIsland", () => {
  const HOST_ID = "nd-test-island";

  afterEach(() => {
    // Remove any host elements left over from the test.
    document.getElementById(HOST_ID)?.remove();
  });

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it("creates a host <div> with data-neurodock, an open shadow root, injected styles, and a root container", () => {
    // Act
    const island = mountIsland(HOST_ID);

    // Assert — host element in document.body
    const host = document.getElementById(HOST_ID);
    expect(host).not.toBeNull();
    expect(host!.getAttribute("data-neurodock")).toBe("true");

    // Assert — shadow root
    expect(island.shadow).toBeTruthy();
    expect(island.shadow.mode).toBe("open");

    // Assert — style injected into shadow with both CSS class selectors
    const styleEl = island.shadow.querySelector("style");
    expect(styleEl).not.toBeNull();
    expect(styleEl!.textContent).toContain(".neurodock-button");
    expect(styleEl!.textContent).toContain(".neurodock-panel");

    // Assert — root container
    const container = island.shadow.querySelector("div[data-neurodock-root]");
    expect(container).not.toBeNull();

    // Assert — island object has the right shape
    expect(island.host).toBe(host);
    expect(typeof island.destroy).toBe("function");
    expect(typeof island.root.render).toBe("function");

    island.destroy();
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it("is idempotent: second call reuses the existing host and does not duplicate it in document.body", () => {
    // Arrange — first mount
    const first = mountIsland(HOST_ID);

    const hostsBefore = document.querySelectorAll(`[id="${HOST_ID}"]`);
    expect(hostsBefore.length).toBe(1);

    // Act — second mount with the same hostId
    const second = mountIsland(HOST_ID);

    // Assert — still only one host element in the DOM
    const hostsAfter = document.querySelectorAll(`[id="${HOST_ID}"]`);
    expect(hostsAfter.length).toBe(1);

    // Both islands reference the same host DOM node
    expect(second.host).toBe(first.host);

    // Each call returns a fresh React root (so the caller can re-render into it)
    // but they share the same shadow-root container node.
    expect(second.shadow).toBe(first.shadow);

    first.destroy();
    // second.destroy would try to remove already-removed element — just clean up
    document.getElementById(HOST_ID)?.remove();
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it("destroy() unmounts the React root and removes the host element from document.body", () => {
    // Arrange
    const island = mountIsland(HOST_ID);
    expect(document.getElementById(HOST_ID)).not.toBeNull();

    // Act
    island.destroy();

    // Assert — host gone from DOM
    expect(document.getElementById(HOST_ID)).toBeNull();
  });
});

// ─── bootstrapContent ────────────────────────────────────────────────────────

describe("bootstrapContent", () => {
  const HOST_ID = "nd-bootstrap-test";

  // Storage-change listener stash: tests can call the captured listener
  // directly to simulate popup saves.
  type StorageListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => void;

  let capturedStorageListeners: StorageListener[];
  let originalOnChanged: typeof chrome.storage.onChanged;
  let originalSendMessage: typeof chrome.runtime.sendMessage;

  beforeEach(() => {
    // Reset mock call history so each test gets a clean slate.
    MockContentApp.mockClear();

    // Capture storage.onChanged listeners without going through the real shim.
    capturedStorageListeners = [];
    originalOnChanged = chrome.storage.onChanged;
    (chrome.storage as Record<string, unknown>)["onChanged"] = {
      addListener: vi.fn((l: StorageListener) => {
        capturedStorageListeners.push(l);
      }),
      removeListener: vi.fn((l: StorageListener) => {
        const idx = capturedStorageListeners.indexOf(l);
        if (idx !== -1) capturedStorageListeners.splice(idx, 1);
      }),
    };

    // Default sendMessage: resolves null (simulates "no reply from background").
    originalSendMessage = chrome.runtime.sendMessage;
    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValue(null);
  });

  afterEach(() => {
    // Restore originals.
    (chrome.storage as Record<string, unknown>)["onChanged"] =
      originalOnChanged;
    (chrome.runtime as Record<string, unknown>)["sendMessage"] =
      originalSendMessage;

    // Clean up any lingering host elements.
    document.getElementById(HOST_ID)?.remove();
  });

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it("performs an initial render with defaultProfile() before the profile:get reply arrives", async () => {
    // Arrange — sendMessage never resolves during this synchronous window
    const sendMessageMock = vi.fn().mockReturnValue(new Promise(() => {})); // pending forever
    (chrome.runtime as Record<string, unknown>)["sendMessage"] =
      sendMessageMock;

    // Act
    await act(async () => {
      bootstrapContent({ channel: "email", hostId: HOST_ID });
      // Flush the synchronous render only; the profile fetch is still pending.
    });

    // Assert — ContentApp was rendered at least once
    expect(MockContentApp).toHaveBeenCalled();

    // The first render uses defaultProfile() which has mode === "local"
    const firstCall = MockContentApp.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    expect(firstCall!.profile.mode).toBe("local");
    expect(firstCall!.channel).toBe("email");

    // Clean up
    document.getElementById(HOST_ID)?.remove();
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it("re-renders with the resolved profile when profile:get resolves", async () => {
    // Arrange — profile:get returns a cloud profile
    const cloudProfile = buildProfile({
      mode: "cloud",
      cloudProvider: "openai",
    });
    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValue(cloudProfile);

    // Act — bootstrap + flush all microtasks so the .then(render) fires
    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "email", hostId: HOST_ID });
    });

    // Assert — ContentApp was called at least twice (initial + after profile)
    expect(MockContentApp.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The last render should have the resolved cloud profile
    const lastCall =
      MockContentApp.mock.calls[MockContentApp.mock.calls.length - 1]?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall!.profile.mode).toBe("cloud");
    expect(lastCall!.profile.cloudProvider).toBe("openai");

    cleanup();
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it("re-requests profile and re-renders when chrome.storage.onChanged fires for the profile key", async () => {
    // Arrange — first resolution is local, second resolution is cloud
    const localProfile = buildProfile({ mode: "local" });
    const cloudProfile = buildProfile({
      mode: "cloud",
      cloudProvider: "anthropic",
    });

    const sendMessageMock = vi
      .fn()
      .mockResolvedValueOnce(localProfile) // initial profile:get
      .mockResolvedValueOnce(cloudProfile); // profile:get after storage change
    (chrome.runtime as Record<string, unknown>)["sendMessage"] =
      sendMessageMock;

    // Act — bootstrap and let the initial profile resolve
    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "slack", hostId: HOST_ID });
    });

    const callsAfterInit = MockContentApp.mock.calls.length;
    expect(callsAfterInit).toBeGreaterThanOrEqual(2);

    // Simulate the popup saving a profile change
    await act(async () => {
      for (const listener of capturedStorageListeners) {
        listener(
          {
            "neurodock.profile.v1": {
              oldValue: localProfile,
              newValue: cloudProfile,
            },
          },
          "local",
        );
      }
    });

    // Assert — a second profile:get was sent
    const profileGetCalls = (
      sendMessageMock.mock.calls as Array<unknown[]>
    ).filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        (args[0] as Record<string, unknown>)["type"] === "profile:get",
    );
    expect(profileGetCalls.length).toBeGreaterThanOrEqual(2);

    // Assert — ContentApp re-rendered with the updated cloud profile
    const lastCall =
      MockContentApp.mock.calls[MockContentApp.mock.calls.length - 1]?.[0];
    expect(lastCall!.profile.mode).toBe("cloud");
    expect(lastCall!.profile.cloudProvider).toBe("anthropic");

    cleanup();
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────

  it("cleanup removes the storage listener AND destroys the island (host removed from body)", async () => {
    // Arrange
    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValue(null);

    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "email", hostId: HOST_ID });
    });

    // Precondition: host exists and a storage listener was registered.
    expect(document.getElementById(HOST_ID)).not.toBeNull();
    expect(capturedStorageListeners.length).toBeGreaterThan(0);

    // Act — call the returned cleanup function
    act(() => {
      cleanup();
    });

    // Assert — host element removed from DOM
    expect(document.getElementById(HOST_ID)).toBeNull();

    // Assert — storage listener was de-registered
    expect(capturedStorageListeners.length).toBe(0);
  });

  // ── Test 5a ───────────────────────────────────────────────────────────────

  it("requestTranslate resolves to the data field when the envelope is success:true", async () => {
    // Arrange — capture the requestTranslate prop from the first render
    let capturedRequestTranslate:
      | ((req: TranslationRequest) => Promise<TranslationResponse | null>)
      | null = null;

    MockContentApp.mockImplementation((props: ContentAppProps) => {
      capturedRequestTranslate = props.requestTranslate;
      return null;
    });

    const fakeResponse: TranslationResponse = {
      ok: true,
      tool: "translate_incoming",
      data: { explicit_ask: "sync up" },
      error: null,
      mockMode: false,
      provenance: { mode: "local", provider: "ollama", model: "llama3.2:3b" },
      timestamp: "2026-05-23T00:00:00.000Z",
    };

    const successEnvelope: RuntimeResponseEnvelope = {
      success: true,
      data: fakeResponse,
      error: null,
    };

    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValueOnce(null) // profile:get returns null
      .mockResolvedValueOnce(successEnvelope); // translate returns the envelope

    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "email", hostId: HOST_ID });
    });

    expect(capturedRequestTranslate).not.toBeNull();

    // Act
    const result = await capturedRequestTranslate!({
      tool: "translate_incoming",
      input: { text: "sync up" },
    });

    // Assert
    expect(result).toBe(fakeResponse);

    cleanup();
    MockContentApp.mockReset();
  });

  // ── Test 5b ───────────────────────────────────────────────────────────────

  it("requestTranslate resolves to null when the envelope is success:false", async () => {
    // Arrange
    let capturedRequestTranslate:
      | ((req: TranslationRequest) => Promise<TranslationResponse | null>)
      | null = null;

    MockContentApp.mockImplementation((props: ContentAppProps) => {
      capturedRequestTranslate = props.requestTranslate;
      return null;
    });

    const failureEnvelope: RuntimeResponseEnvelope = {
      success: false,
      data: null,
      error: "provider unavailable",
    };

    (chrome.runtime as Record<string, unknown>)["sendMessage"] = vi
      .fn()
      .mockResolvedValueOnce(null) // profile:get
      .mockResolvedValueOnce(failureEnvelope); // translate returns error envelope

    let cleanup!: () => void;
    await act(async () => {
      cleanup = bootstrapContent({ channel: "email", hostId: HOST_ID });
    });

    expect(capturedRequestTranslate).not.toBeNull();

    // Act
    const result = await capturedRequestTranslate!({
      tool: "translate_incoming",
      input: { text: "touch base" },
    });

    // Assert
    expect(result).toBeNull();

    cleanup();
    MockContentApp.mockReset();
  });
});
