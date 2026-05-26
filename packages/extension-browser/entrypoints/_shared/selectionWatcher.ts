/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * selectionWatcher.ts
 *
 * Detect when the user focuses an editable element (input, textarea, or
 * contenteditable) so the floating Translate button can mount near it.
 *
 * Constraints from the agent operating manual:
 *   - At most one DOM observer per page (mutation observer for SPA
 *     re-injection). This file owns it.
 *   - Defer heavy work; only fire callbacks on actual focus / blur of
 *     editable elements.
 *   - Never read auto-fill or saved passwords. We ignore <input type="password">.
 *   - Honour the host site's CSP — no eval, no inline scripts.
 */

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export interface SelectionWatcherOptions {
  readonly onEditableFocus: (element: Editable) => void;
  readonly onEditableBlur: () => void;
}

export interface SelectionWatcherHandle {
  readonly disconnect: () => void;
}

const IGNORE_INPUT_TYPES = new Set([
  "password",
  "hidden",
  "file",
  "submit",
  "reset",
  "button",
  "checkbox",
  "radio",
  "image",
  "color",
  "range",
]);

export function isEditableElement(node: EventTarget | null): node is Editable {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLInputElement) {
    return !IGNORE_INPUT_TYPES.has((node.type ?? "text").toLowerCase());
  }
  if (node instanceof HTMLTextAreaElement) return true;
  if (node.isContentEditable === true) return true;
  return false;
}

export function startSelectionWatcher(
  doc: Document,
  options: SelectionWatcherOptions,
): SelectionWatcherHandle {
  const focusHandler = (event: FocusEvent): void => {
    if (isEditableElement(event.target)) {
      options.onEditableFocus(event.target);
    }
  };
  const blurHandler = (event: FocusEvent): void => {
    if (isEditableElement(event.target)) {
      // Defer: if focus immediately moves to another editable, suppress blur.
      queueMicrotask(() => {
        const active = doc.activeElement;
        if (!isEditableElement(active)) {
          options.onEditableBlur();
        }
      });
    }
  };

  doc.addEventListener("focusin", focusHandler, true);
  doc.addEventListener("focusout", blurHandler, true);

  // Initial sweep: if an editable is ALREADY focused when the content
  // script loads (a common case on SPAs like Gmail or Slack where the
  // compose box is auto-focused before our document_idle injection
  // runs), we never receive a `focusin` event for it. Without this the
  // floating Translate button stays hidden until the user clicks
  // elsewhere and back. Defer one microtask so the React island has
  // mounted before we fire the callback.
  queueMicrotask(() => {
    const active = doc.activeElement;
    if (isEditableElement(active)) {
      options.onEditableFocus(active);
    }
  });

  // SPA navigation re-injection. The single mutation observer per page.
  const observer = new MutationObserver(() => {
    const active = doc.activeElement;
    if (isEditableElement(active)) {
      options.onEditableFocus(active);
    }
  });
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
  });

  return {
    disconnect: () => {
      doc.removeEventListener("focusin", focusHandler, true);
      doc.removeEventListener("focusout", blurHandler, true);
      observer.disconnect();
    },
  };
}
