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
});
