import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CloudModeBanner } from "../../src/lib/cloud-mode-banner.js";
import { defaultProfile } from "../../src/lib/profile.js";
import type { ExtensionProfile } from "../../src/lib/types.js";

describe("CloudModeBanner", () => {
  it("renders nothing in local mode", () => {
    const { container } = render(
      <CloudModeBanner profile={defaultProfile()} onSwitchToLocal={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders persistently in cloud mode with the provider id surfaced", () => {
    const cloudProfile: ExtensionProfile = {
      ...defaultProfile(),
      mode: "cloud",
      cloudProvider: "anthropic",
      cloudModel: "claude-sonnet-4.6",
    };
    render(<CloudModeBanner profile={cloudProfile} onSwitchToLocal={() => {}} />);
    expect(screen.getByTestId("cloud-mode-banner")).toBeInTheDocument();
    expect(screen.getByText(/anthropic/)).toBeInTheDocument();
  });

  it("invokes onSwitchToLocal when the switch link is clicked", () => {
    const onSwitch = vi.fn();
    const cloudProfile: ExtensionProfile = {
      ...defaultProfile(),
      mode: "cloud",
      cloudProvider: "openai",
      cloudModel: "gpt-x",
    };
    render(<CloudModeBanner profile={cloudProfile} onSwitchToLocal={onSwitch} />);
    screen.getByRole("button", { name: /switch back to local/i }).click();
    expect(onSwitch).toHaveBeenCalledOnce();
  });
});
