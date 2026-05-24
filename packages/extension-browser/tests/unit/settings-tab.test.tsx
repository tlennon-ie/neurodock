import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsTab } from "../../entrypoints/popup/SettingsTab.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function baseProfile(
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
    neurotypes: [],
    outputFormat: "answer_first",
    maxChunkSize: 5,
    additionalNotes: null,
    ...overrides,
  };
}

describe("SettingsTab", () => {
  it("renders the six mode options with Local Ollama as the default", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    expect(screen.getByLabelText(/Local Ollama/)).toBeChecked();
    expect(screen.getByLabelText(/Local LM Studio/)).not.toBeChecked();
    expect(screen.getByLabelText(/Cloud Anthropic/)).not.toBeChecked();
    expect(screen.getByLabelText(/Cloud OpenAI/)).not.toBeChecked();
    expect(screen.getByLabelText(/Cloud OpenRouter/)).not.toBeChecked();
    expect(screen.getByLabelText(/Mock/)).not.toBeChecked();
  });

  it("shows the plain-text API key input only before save", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          mode: "cloud",
          cloudProvider: "anthropic",
          cloudModel: "claude-haiku-4-5",
          cloudApiKey: null,
        })}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("cloud-api-key-input")).toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-api-key-masked"),
    ).not.toBeInTheDocument();
  });

  it("masks the API key after a save and offers a Clear control", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          mode: "cloud",
          cloudProvider: "anthropic",
          cloudModel: "claude-haiku-4-5",
          cloudApiKey: "sk-ant-abcdef1234",
        })}
        onChange={onChange}
      />,
    );
    const masked = screen.getByTestId("cloud-api-key-masked");
    expect(masked).toHaveTextContent(/••••1234/);
    expect(screen.queryByTestId("cloud-api-key-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("cloud-api-key-clear")).toBeInTheDocument();
  });

  it("clears the key and reverts mode to local on Clear", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          mode: "cloud",
          cloudProvider: "openai",
          cloudModel: "gpt-4o-mini",
          cloudApiKey: "sk-openai-xxxx",
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("cloud-api-key-clear"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        cloudApiKey: null,
        mode: "local",
      });
    });
  });

  it("saves a typed key and switches to cloud mode", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          mode: "cloud",
          cloudProvider: "anthropic",
          cloudModel: "claude-haiku-4-5",
          cloudApiKey: null,
        })}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("cloud-api-key-input"), {
      target: { value: "sk-ant-new-key" },
    });
    fireEvent.click(screen.getByTestId("cloud-api-key-save"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          cloudProvider: "anthropic",
          cloudApiKey: "sk-ant-new-key",
          mode: "cloud",
        }),
      );
    });
  });

  it("renders the Test connection button", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    expect(screen.getByTestId("provider-test-button")).toHaveTextContent(
      /Test connection/,
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // v0.0.3 regression — cloud radios must be clickable even without a
  // saved API key. Previously the radios appeared to "snap back" because
  // selectedModeFromProfile derived the active option from `profile.mode`
  // (which is only `cloud` after a key is saved).
  // ──────────────────────────────────────────────────────────────────

  it("clicking Cloud OpenRouter stages the provider intent immediately", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("mode-radio-cloud-openrouter"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ cloudProvider: "openrouter" }),
      );
    });
    // mode must stay non-cloud until a key is saved (privacy contract).
    const call = onChange.mock.calls[0]?.[0] as Partial<ExtensionProfile>;
    expect(call.mode).not.toBe("cloud");
  });

  it("clicking Cloud Anthropic stages the provider intent immediately", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("mode-radio-cloud-anthropic"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ cloudProvider: "anthropic" }),
      );
    });
  });

  it("clicking Cloud OpenAI stages the provider intent immediately", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("mode-radio-cloud-openai"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ cloudProvider: "openai" }),
      );
    });
  });

  it("Cloud OpenRouter radio appears checked once the provider is staged, before any key is saved", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          mode: "local",
          cloudProvider: "openrouter",
          cloudModel: "openrouter/auto",
          cloudApiKey: null,
        })}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText(/Cloud OpenRouter/)).toBeChecked();
    expect(screen.getByLabelText(/Local Ollama/)).not.toBeChecked();
  });

  // ──────────────────────────────────────────────────────────────────
  // v0.0.3 — LM Studio support.
  // ──────────────────────────────────────────────────────────────────

  it("clicking Local LM Studio switches localProvider to lmstudio", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("mode-radio-local-lmstudio"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "local",
          localProvider: "lmstudio",
          localEndpoint: "http://localhost:1234/v1",
        }),
      );
    });
  });

  it("LM Studio panel exposes a base-URL field under Advanced", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          localProvider: "lmstudio",
          localEndpoint: "http://localhost:1234/v1",
        })}
        onChange={onChange}
      />,
    );
    // LM Studio model picker is rendered, with the refresh button.
    expect(screen.getByTestId("lmstudio-model-refresh")).toBeInTheDocument();
  });

  it("LM Studio optional API key is masked after save", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          localProvider: "lmstudio",
          localEndpoint: "http://localhost:1234/v1",
          localApiKey: "sk-lm-abcd1234",
        })}
        onChange={onChange}
      />,
    );
    const masked = screen.getByTestId("lmstudio-api-key-masked");
    expect(masked).toHaveTextContent(/••••1234/);
  });

  // ──────────────────────────────────────────────────────────────────
  // v0.0.4 — non-localhost local providers + host-permission flow.
  // ──────────────────────────────────────────────────────────────────

  it("shows the NonLocalhostNotice when LM Studio Base URL is non-localhost", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          localProvider: "lmstudio",
          localEndpoint: "http://192.168.1.50:1234/v1",
        })}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("lmstudio-host-permission")).toBeInTheDocument();
    expect(
      screen.getByTestId("lmstudio-host-permission-grant"),
    ).toHaveTextContent(/http:\/\/192\.168\.1\.50:1234/);
  });

  it("does NOT show the NonLocalhostNotice when LM Studio is on localhost", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsTab
        profile={baseProfile({
          localProvider: "lmstudio",
          localEndpoint: "http://localhost:1234/v1",
        })}
        onChange={onChange}
      />,
    );
    expect(
      screen.queryByTestId("lmstudio-host-permission"),
    ).not.toBeInTheDocument();
  });

  it("clicking Grant for a non-localhost LM Studio host calls chrome.permissions.request with the right origin", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const requestSpy = vi.fn(
      (_perm: { origins?: string[] }, cb: (g: boolean) => void) => cb(true),
    );
    const containsSpy = vi.fn(
      (_perm: { origins?: string[] }, cb: (g: boolean) => void) => cb(false),
    );
    (
      globalThis as unknown as {
        chrome: { permissions: unknown };
      }
    ).chrome.permissions = {
      request: requestSpy,
      contains: containsSpy,
      remove: (_perm: { origins?: string[] }, cb: (g: boolean) => void) =>
        cb(true),
      getAll: (cb: (a: { origins: string[] }) => void) => cb({ origins: [] }),
    };

    render(
      <SettingsTab
        profile={baseProfile({
          localProvider: "lmstudio",
          localEndpoint: "http://192.168.1.50:1234/v1",
        })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("lmstudio-host-permission-grant"));

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(
        { origins: ["http://192.168.1.50:1234/*"] },
        expect.any(Function),
      );
    });
  });

  it("clicking Refresh models for a non-localhost LM Studio URL requests permission first", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const requestSpy = vi.fn(
      (_perm: { origins?: string[] }, cb: (g: boolean) => void) => cb(false),
    );
    const containsSpy = vi.fn(
      (_perm: { origins?: string[] }, cb: (g: boolean) => void) => cb(false),
    );
    (
      globalThis as unknown as {
        chrome: { permissions: unknown };
      }
    ).chrome.permissions = {
      request: requestSpy,
      contains: containsSpy,
      remove: (_perm: { origins?: string[] }, cb: (g: boolean) => void) =>
        cb(true),
      getAll: (cb: (a: { origins: string[] }) => void) => cb({ origins: [] }),
    };

    render(
      <SettingsTab
        profile={baseProfile({
          localProvider: "lmstudio",
          localEndpoint: "http://169.254.83.107:1234/v1",
        })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("lmstudio-model-refresh"));

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(
        { origins: ["http://169.254.83.107:1234/*"] },
        expect.any(Function),
      );
    });
    // And because the user denied, the model picker surfaces an error
    // instead of a successful fetch.
    await waitFor(() => {
      expect(screen.getByTestId("lmstudio-model-error")).toHaveTextContent(
        /Permission denied/,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Proactive guardrails panel — watchdog toggle + Phase 1 / 3 copy.
  // ──────────────────────────────────────────────────────────────────

  it("watchdog toggle defaults to checked when storage has no key set", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const getSpy = vi.fn(async (_keys: string | string[]) => ({}));
    const setSpy = vi.fn(async (_items: Record<string, unknown>) => {});
    (
      globalThis as unknown as {
        chrome: { storage: { local: unknown } };
      }
    ).chrome.storage.local = { get: getSpy, set: setSpy };

    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("watchdog-toggle")).toBeChecked();
    });
    expect(getSpy).toHaveBeenCalledWith("neurodock.watchdog.enabled");
  });

  it("watchdog toggle renders unchecked when storage returns false", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const getSpy = vi.fn(async (_keys: string | string[]) => ({
      "neurodock.watchdog.enabled": false,
    }));
    const setSpy = vi.fn(async (_items: Record<string, unknown>) => {});
    (
      globalThis as unknown as {
        chrome: { storage: { local: unknown } };
      }
    ).chrome.storage.local = { get: getSpy, set: setSpy };

    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("watchdog-toggle")).not.toBeChecked();
    });
  });

  it("clicking the watchdog toggle persists the inverted value to chrome.storage.local", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const getSpy = vi.fn(async (_keys: string | string[]) => ({}));
    const setSpy = vi.fn(async (_items: Record<string, unknown>) => {});
    (
      globalThis as unknown as {
        chrome: { storage: { local: unknown } };
      }
    ).chrome.storage.local = { get: getSpy, set: setSpy };

    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);

    // Wait for the initial read to settle so the checkbox is in the
    // default-on state before we flip it.
    await waitFor(() => {
      expect(screen.getByTestId("watchdog-toggle")).toBeChecked();
    });

    fireEvent.click(screen.getByTestId("watchdog-toggle"));

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith({
        "neurodock.watchdog.enabled": false,
      });
    });
  });

  it("renders Phase 1 and Phase 3 info blocks with documented opt-out commands", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);

    const phase1 = screen.getByTestId("guardrail-phase1-info");
    expect(phase1).toHaveTextContent("neurodock install-hooks --self-test");
    expect(phase1).toHaveTextContent("export NEURODOCK_GUARDRAILS=off");

    const phase3 = screen.getByTestId("guardrail-phase3-info");
    expect(phase3).toHaveTextContent(
      "neurodock install-hooks --install-daemon",
    );
  });

  it("Host permissions panel lists granted non-default origins", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    (
      globalThis as unknown as {
        chrome: { permissions: unknown };
      }
    ).chrome.permissions = {
      request: (_perm: { origins?: string[] }, cb: (g: boolean) => void) =>
        cb(false),
      contains: (_perm: { origins?: string[] }, cb: (g: boolean) => void) =>
        cb(false),
      remove: (_perm: { origins?: string[] }, cb: (g: boolean) => void) =>
        cb(true),
      getAll: (cb: (a: { origins: string[] }) => void) =>
        cb({
          origins: [
            "http://localhost/*",
            "https://api.openai.com/*",
            "http://169.254.83.107:1234/*",
          ],
        }),
    };

    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    await waitFor(() => {
      expect(
        screen.getByTestId("host-permission-row-http://169.254.83.107:1234"),
      ).toBeInTheDocument();
    });
  });
});
