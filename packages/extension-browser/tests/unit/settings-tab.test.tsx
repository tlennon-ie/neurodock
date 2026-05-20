import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsTab } from "../../entrypoints/popup/SettingsTab.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

function baseProfile(
  overrides: Partial<ExtensionProfile> = {}
): ExtensionProfile {
  return {
    mode: "local",
    localEndpoint: "http://localhost:11434",
    localModel: "llama3.2:3b",
    cloudProvider: null,
    cloudModel: null,
    cloudApiKey: null,
    historyEnabled: false,
    displayName: "you",
    ...overrides,
  };
}

describe("SettingsTab", () => {
  it("renders the four mode options with Local Ollama as the default", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    expect(screen.getByLabelText(/Local Ollama/)).toBeChecked();
    expect(screen.getByLabelText(/Cloud Anthropic/)).not.toBeChecked();
    expect(screen.getByLabelText(/Cloud OpenAI/)).not.toBeChecked();
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
      />
    );
    expect(screen.getByTestId("cloud-api-key-input")).toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-api-key-masked")
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
      />
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
      />
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
    // To render the cloud-anthropic fieldset we need
    // selectedModeFromProfile() to return "cloud-anthropic" — which means
    // mode === "cloud" AND cloudProvider === "anthropic". In real flow
    // the user selects the Cloud Anthropic radio first; mode stays local
    // (because no key yet) and provider is staged. We approximate the
    // "form visible" state by passing the cloud-provider sentinel even
    // without a key.
    render(
      <SettingsTab
        profile={baseProfile({
          mode: "cloud",
          cloudProvider: "anthropic",
          cloudModel: "claude-haiku-4-5",
          cloudApiKey: null,
        })}
        onChange={onChange}
      />
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
        })
      );
    });
  });

  it("renders the Test connection button", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<SettingsTab profile={baseProfile()} onChange={onChange} />);
    expect(screen.getByTestId("provider-test-button")).toHaveTextContent(
      /Test connection/
    );
  });
});
