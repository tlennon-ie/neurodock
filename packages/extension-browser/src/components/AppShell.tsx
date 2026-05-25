/**
 * @license AGPL-3.0-or-later
 *
 * AppShell — shared layout for the popup AND the full-tab view.
 *
 * Modes:
 *   - "popup": compact 400px-wide vertical stack used by the toolbar
 *     popup. Header, banner, save-error row, main content.
 *   - "tab":   wide layout (~1200px max) with header bar across the top,
 *     a left rail for navigation, and a generous main pane. Used by the
 *     full-tab page at chrome-extension://.../tab.html.
 *
 * Both modes consume the SAME data via children/render props — the
 * shell only owns layout, not state. State lives in useAppData()
 * (src/components/useAppData.ts), so popup and tab read identical
 * profile/history/syncStatus values.
 *
 * Voice (plan.md §2): direct, plain, non-clinical. No emojis. Generous
 * typography (16–18px body in the tab mode, 1.65 line-height).
 */
import React from "react";

export type AppShellMode = "popup" | "tab";

export interface AppShellProps {
  readonly mode: AppShellMode;
  readonly header: React.ReactNode;
  readonly banner?: React.ReactNode;
  readonly nav?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly aside?: React.ReactNode;
}

export function AppShell({
  mode,
  header,
  banner,
  nav,
  children,
  aside,
}: AppShellProps): React.ReactElement {
  if (mode === "popup") {
    return (
      <main
        className="flex flex-col gap-4 p-4"
        data-testid="app-shell-popup"
        data-shell-mode="popup"
      >
        {header}
        {banner}
        {nav}
        {children}
        {aside}
      </main>
    );
  }
  // Tab mode: wider layout, header bar across the top, left rail for
  // navigation, main pane in the middle, optional aside on the right.
  return (
    <div
      className="leading-nd min-h-screen bg-neutral-50 text-base text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100"
      data-testid="app-shell-tab"
      data-shell-mode="tab"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-8 py-10">
        <div className="flex flex-col gap-3">
          {header}
          {banner}
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
          {nav ? (
            <aside
              className="md:sticky md:top-10 md:self-start"
              aria-label="Sections"
            >
              {nav}
            </aside>
          ) : null}
          <section className="flex max-w-[75ch] flex-col gap-8">
            {children}
          </section>
        </div>
        {aside}
      </div>
    </div>
  );
}
