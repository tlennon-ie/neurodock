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
      className="font-body leading-nd flex items-start gap-3 border border-warn-light bg-neutral-50 px-4 py-3 text-sm text-neutral-900 dark:border-warn-dark dark:bg-neutral-900 dark:text-neutral-100"
    >
      <span aria-hidden="true" className="select-none font-mono text-warn-light dark:text-warn-dark">
        cloud
      </span>
      <div className="flex-1">
        <p className="m-0">
          NeuroDock is in cloud mode. Text you translate leaves your device
          for <strong>{provider}</strong>.
        </p>
        <button
          type="button"
          onClick={onSwitchToLocal}
          className="mt-1 underline focus:outline-none focus:ring-2 focus:ring-accent-light dark:focus:ring-accent-dark"
        >
          Switch back to local
        </button>
      </div>
    </div>
  );
}
