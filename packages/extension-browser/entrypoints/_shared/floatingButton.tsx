/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Floating "Translate" button that appears near a focused editable element.
 *
 * Constraints (agent operating manual):
 *   - Floating, never modal.
 *   - Never modifies page content without explicit user action.
 *   - Keyboard accessible (Enter / Space activates).
 *   - Respects reduced-motion: no animation on appearance.
 */
import React from "react";

export interface FloatingButtonProps {
  readonly visible: boolean;
  readonly anchor: { readonly top: number; readonly left: number };
  readonly onActivate: () => void;
  readonly label?: string;
}

export function FloatingButton({
  visible,
  anchor,
  onActivate,
  label = "Translate",
}: FloatingButtonProps): React.ReactElement | null {
  if (!visible) return null;
  return (
    <button
      type="button"
      className="neurodock-button"
      style={{
        position: "fixed",
        top: `${anchor.top}px`,
        left: `${anchor.left}px`,
      }}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      aria-label="NeuroDock: translate or check this message"
      data-testid="neurodock-floating-button"
    >
      {label}
    </button>
  );
}
