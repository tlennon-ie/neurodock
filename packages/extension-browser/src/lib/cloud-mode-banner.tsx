/**
 * Persistent cloud-mode banner.
 *
 * Plan.md §7: "cloud mode shows a persistent 'cloud mode' banner until
 * switched off."
 *
 * Rules:
 * - Visible whenever profile.mode === "cloud".
 * - Plain language; no alarming colour. Per plan.md §2 the visual language
 *   is calm — we use desaturated amber.
 * - Includes the provider name so the user always knows where their text
 *   is going.
 * - Includes a one-click "switch to local" button.
 * - No dismiss-without-switch. The point is that the banner is persistent.
 */
import React from "react";
import type { ExtensionProfile } from "./types.js";

export interface CloudModeBannerProps {
  readonly profile: ExtensionProfile;
  readonly onSwitchToLocal: () => void;
}

export function CloudModeBanner({
  profile,
  onSwitchToLocal,
}: CloudModeBannerProps): React.ReactElement | null {
  if (profile.mode !== "cloud") return null;

  const provider = profile.cloudProvider ?? "unconfigured provider";
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="cloud-mode-banner"
      className="font-body leading-nd border-warn-border bg-warn-bg text-fg flex items-start gap-3 border px-4 py-3 text-sm"
    >
      <span aria-hidden="true" className="text-warn-fg select-none font-mono">
        cloud
      </span>
      <div className="flex-1">
        <p className="m-0">
          NeuroDock is in cloud mode. Text you translate leaves your device for{" "}
          <strong>{provider}</strong>.
        </p>
        <button
          type="button"
          onClick={onSwitchToLocal}
          className="text-fg-accent focus-visible:outline-accent mt-1 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Switch back to local
        </button>
      </div>
    </div>
  );
}
