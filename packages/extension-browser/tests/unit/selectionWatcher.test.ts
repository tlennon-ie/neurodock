import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isEditableElement,
  startSelectionWatcher,
} from "../../entrypoints/_shared/selectionWatcher.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("selectionWatcher", () => {
  it("recognises plain text inputs as editable", () => {
    const input = document.createElement("input");
    input.type = "text";
    expect(isEditableElement(input)).toBe(true);
  });

  it("ignores password inputs (never read auto-fill or passwords)", () => {
    const input = document.createElement("input");
    input.type = "password";
    expect(isEditableElement(input)).toBe(false);
  });

  it("ignores checkboxes and radios", () => {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    expect(isEditableElement(cb)).toBe(false);
  });

  it("recognises textareas as editable", () => {
    const ta = document.createElement("textarea");
    expect(isEditableElement(ta)).toBe(true);
  });

  it("recognises contenteditable elements as editable", () => {
    const div = document.createElement("div");
    // jsdom does not implement HTMLElement.isContentEditable from the
    // contentEditable setter alone. Define the getter directly so the
    // check in our production code (which uses isContentEditable) works.
    Object.defineProperty(div, "isContentEditable", {
      value: true,
      configurable: true,
    });
    div.setAttribute("contenteditable", "true");
    expect(isEditableElement(div)).toBe(true);
  });

  it("fires onEditableFocus when a textarea receives focus", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);

    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const handle = startSelectionWatcher(document, {
      onEditableFocus: onFocus,
      onEditableBlur: onBlur,
    });

    ta.focus();
    // jsdom dispatches focusin synchronously via .focus()
    expect(onFocus).toHaveBeenCalledWith(ta);
    handle.disconnect();
  });

  it("does not fire focus callback for non-editable elements", () => {
    const span = document.createElement("span");
    span.tabIndex = 0;
    document.body.appendChild(span);

    const onFocus = vi.fn();
    const handle = startSelectionWatcher(document, {
      onEditableFocus: onFocus,
      onEditableBlur: vi.fn(),
    });

    span.focus();
    expect(onFocus).not.toHaveBeenCalled();
    handle.disconnect();
  });
});
