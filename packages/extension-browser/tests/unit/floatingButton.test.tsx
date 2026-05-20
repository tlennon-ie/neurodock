import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloatingButton } from "../../entrypoints/_shared/floatingButton.js";

describe("FloatingButton", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(
      <FloatingButton
        visible={false}
        anchor={{ top: 0, left: 0 }}
        onActivate={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders with an accessible label when visible", () => {
    render(
      <FloatingButton
        visible={true}
        anchor={{ top: 10, left: 20 }}
        onActivate={() => {}}
      />,
    );
    const btn = screen.getByTestId("neurodock-floating-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label");
  });

  it("fires onActivate when clicked", () => {
    const onActivate = vi.fn();
    render(
      <FloatingButton
        visible={true}
        anchor={{ top: 0, left: 0 }}
        onActivate={onActivate}
      />,
    );
    screen.getByTestId("neurodock-floating-button").click();
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("fires onActivate on Enter key", () => {
    const onActivate = vi.fn();
    render(
      <FloatingButton
        visible={true}
        anchor={{ top: 0, left: 0 }}
        onActivate={onActivate}
      />,
    );
    const btn = screen.getByTestId("neurodock-floating-button");
    btn.focus();
    btn.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(onActivate).toHaveBeenCalled();
  });
});
