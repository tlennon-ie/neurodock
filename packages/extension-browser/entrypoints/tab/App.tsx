/**
 * @license AGPL-3.0-or-later
 *
 * Tab view — the spacious counterpart to the popup.
 *
 * Reads the same data layer as the popup (useAppData → loadProfile,
 * listHistory, getSyncStatus, saveProfileWithOutcome, clearHistory)
 * so the two surfaces always agree. The popup remains the
 * fast-access compact form; the tab view exists for users who want:
 *
 *  - History with expanded structured detail by default (no
 *    click-to-expand — every row shows the full structured response).
 *  - Multi-section settings reached via a left rail rather than the
 *    popup's accordion.
 *  - A roomy notifications inbox slot (placeholder here — agent B
 *    delivers the actual inbox; this view exposes the slot via the
 *    shared AppShell so the data shape can settle first).
 *
 * URL hash protocol: `#view=home|history|settings|notifications`
 * forwarded from the popup. We restore the section but DO NOT deep-link
 * into individual history rows yet (see report — punted to a follow-up).
 *
 * Voice (plan.md §2): translate, do not summarise. No emojis. Plain
 * direct copy. Generous typography (17px body, 1.65 line-height,
 * ~70ch reading measure).
 */
import React, { useCallback, useEffect, useState } from "react";
import type { ExtensionProfile, HistoryEntry } from "../../src/lib/types.js";
import { CloudModeBanner } from "../../src/lib/cloud-mode-banner.js";
import { SettingsTab } from "../popup/SettingsTab.js";
import { ToolView, SourcePreview } from "../_shared/panel.js";
import { AppShell } from "../../src/components/AppShell.js";
import { useAppData } from "../../src/components/useAppData.js";
import type { ProfileSyncStatus } from "../../src/lib/profile.js";

type TabView = "home" | "history" | "settings" | "notifications";

const VALID_VIEWS: readonly TabView[] = [
  "home",
  "history",
  "settings",
  "notifications",
];

function viewFromHash(hash: string): TabView {
  const m = /^#view=([^&]+)/.exec(hash);
  if (!m || !m[1]) return "home";
  const candidate = decodeURIComponent(m[1]);
  return VALID_VIEWS.includes(candidate as TabView)
    ? (candidate as TabView)
    : "home";
}

function initialView(): TabView {
  if (typeof window === "undefined") return "home";
  return viewFromHash(window.location.hash);
}

export function TabApp(): React.ReactElement {
  const data = useAppData({ historyPageSize: 100 });
  const [view, setView] = useState<TabView>(initialView);

  // Keep `view` synced with the URL so back/forward and shared links
  // restore the intended section. We do not deep-link into individual
  // history rows in this iteration — that is a follow-up.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onHashChange = (): void => {
      setView(viewFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleSwitchLocal = useCallback((): void => {
    void data.update({ mode: "local" });
  }, [data]);

  const navigate = useCallback((next: TabView): void => {
    setView(next);
    if (typeof window !== "undefined") {
      // Replace (not push) so the back button does not pile up every
      // section change. Users still reach the section directly via
      // popup → Open in tab with #view=… encoded.
      const url = `${window.location.pathname}#view=${next}`;
      window.history.replaceState(null, "", url);
    }
  }, []);

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="font-heading m-0 text-3xl font-medium">NeuroDock</h1>
      <p className="m-0 max-w-[60ch] text-neutral-600 dark:text-neutral-400">
        Decode subtext. Check tone. Local-first by default. This is the full-tab
        view — same data as the toolbar popup, more room to read.
      </p>
    </header>
  );

  const banner = (
    <>
      <CloudModeBanner
        profile={data.profile}
        onSwitchToLocal={handleSwitchLocal}
      />
      {data.saveError !== null ? (
        <div
          role="alert"
          data-testid="tab-save-error"
          className="flex items-start justify-between gap-3 border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
        >
          <span>
            <strong>Save failed.</strong> {data.saveError}
          </span>
          <button
            type="button"
            onClick={data.dismissSaveError}
            className="border border-red-300 px-2 py-0.5 text-xs dark:border-red-700"
            aria-label="Dismiss save error"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );

  const nav = <SideNav current={view} onChange={navigate} />;

  return (
    <AppShell mode="tab" header={header} banner={banner} nav={nav}>
      {view === "home" ? (
        <HomeSection
          profile={data.profile}
          history={data.history}
          syncStatus={data.syncStatus}
        />
      ) : null}
      {view === "history" ? (
        <HistorySection
          profile={data.profile}
          history={data.history}
          onToggleHistory={(enabled) =>
            void data.update({ historyEnabled: enabled })
          }
          onClearHistory={data.clearAllHistory}
        />
      ) : null}
      {view === "settings" ? (
        <SettingsSection profile={data.profile} onChange={data.update} />
      ) : null}
      {view === "notifications" ? <NotificationsPlaceholder /> : null}
      {data.loaded ? null : (
        <p className="text-sm text-neutral-500">Loading your profile…</p>
      )}
    </AppShell>
  );
}

interface SideNavProps {
  readonly current: TabView;
  readonly onChange: (next: TabView) => void;
}

function SideNav({ current, onChange }: SideNavProps): React.ReactElement {
  const items: { id: TabView; label: string; hint: string }[] = [
    { id: "home", label: "Home", hint: "Status and the latest activity." },
    { id: "history", label: "History", hint: "Every translation, expanded." },
    { id: "settings", label: "Settings", hint: "Provider, model, privacy." },
    {
      id: "notifications",
      label: "Notifications",
      hint: "Inbox of background events.",
    },
  ];
  return (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={active ? "page" : undefined}
            data-testid={`tab-nav-${item.id}`}
            className={
              "flex flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700 dark:focus-visible:outline-neutral-300 " +
              (active
                ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900"
                : "border-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900")
            }
          >
            <span className="font-heading font-medium text-neutral-900 dark:text-neutral-100">
              {item.label}
            </span>
            <span className="text-xs text-neutral-500">{item.hint}</span>
          </button>
        );
      })}
    </nav>
  );
}

interface HomeSectionProps {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly syncStatus: ProfileSyncStatus | null;
}

function HomeSection({
  profile,
  history,
  syncStatus,
}: HomeSectionProps): React.ReactElement {
  const recent = history.slice(0, 5);
  return (
    <>
      <section aria-labelledby="status-heading" className="flex flex-col gap-2">
        <h2
          id="status-heading"
          className="font-heading m-0 text-xl font-medium"
        >
          Status
        </h2>
        <ModeSummary profile={profile} />
      </section>
      <section aria-labelledby="sync-heading" className="flex flex-col gap-2">
        <h2 id="sync-heading" className="font-heading m-0 text-xl font-medium">
          Profile sync
        </h2>
        <ProfileSyncLine status={syncStatus} />
      </section>
      <section aria-labelledby="recent-heading" className="flex flex-col gap-2">
        <h2
          id="recent-heading"
          className="font-heading m-0 text-xl font-medium"
        >
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <p className="m-0 text-sm text-neutral-500">
            No translations yet. Right-click selected text or an image on a
            supported site to start.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="border-l-2 border-neutral-300 pl-3 dark:border-neutral-700"
              >
                <div className="font-mono text-xs">{entry.tool}</div>
                <div className="text-xs text-neutral-500">
                  {formatTimestamp(entry.timestamp)} · {entry.mode} ·{" "}
                  {entry.provider ?? "unknown"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

interface HistorySectionProps {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly onToggleHistory: (enabled: boolean) => void;
  readonly onClearHistory: () => Promise<void> | void;
}

function HistorySection({
  profile,
  history,
  onToggleHistory,
  onClearHistory,
}: HistorySectionProps): React.ReactElement {
  return (
    <section
      aria-labelledby="history-heading"
      className="flex flex-col gap-4"
      data-testid="tab-history-section"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="history-heading"
            className="font-heading m-0 text-xl font-medium"
          >
            History
          </h2>
          <p className="m-0 max-w-[60ch] text-sm text-neutral-600 dark:text-neutral-400">
            Every translation NeuroDock has produced on this device, with the
            full structured response inline. Nothing on this page leaves your
            browser.
          </p>
        </div>
        {history.length > 0 ? (
          <button
            type="button"
            onClick={() => void onClearHistory()}
            data-testid="tab-clear-history"
            className="self-start border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            aria-label="Wipe all NeuroDock translation history"
          >
            Wipe history ({history.length})
          </button>
        ) : null}
      </header>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={profile.historyEnabled}
          onChange={(e) => onToggleHistory(e.target.checked)}
        />
        <span>
          Keep a local history of translations (metadata + structured response,
          never sent anywhere).
        </span>
      </label>
      {profile.historyEnabled && history.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No translations yet. Right-click selected text or an image on a
          supported site to start.
        </p>
      ) : null}
      {profile.historyEnabled && history.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-6 p-0">
          {history.map((entry) => (
            <li
              key={entry.id}
              data-testid="tab-history-row"
              className="border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <HistoryEntryDetail entry={entry} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface HistoryEntryDetailProps {
  readonly entry: HistoryEntry;
}

function HistoryEntryDetail({
  entry,
}: HistoryEntryDetailProps): React.ReactElement {
  const response = entry.response;
  const provider = entry.provider ?? "unknown";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-sm">{entry.tool}</div>
        <div className="text-xs text-neutral-500">
          {formatTimestamp(entry.timestamp)} · {entry.mode} · {provider}
        </div>
      </div>
      {response ? (
        <>
          {extractSourcePreview(entry).length > 0 ? (
            <SourcePreview text={extractSourcePreview(entry)} />
          ) : null}
          {response.ok && response.data !== null ? (
            <ToolView
              tool={response.tool}
              data={response.data as Record<string, unknown>}
            />
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">
              Error: {response.error ?? "Unknown error"}
            </p>
          )}
          <p className="text-xs text-neutral-500">
            via {response.provenance.provider} · {response.provenance.model} ·{" "}
            {response.provenance.mode}
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          (No detail saved — this row predates the response-persistence
          feature.)
        </p>
      )}
    </div>
  );
}

interface SettingsSectionProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

function SettingsSection({
  profile,
  onChange,
}: SettingsSectionProps): React.ReactElement {
  return (
    <section
      aria-labelledby="settings-heading"
      className="flex flex-col gap-4"
      data-testid="tab-settings-section"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="settings-heading"
          className="font-heading m-0 text-xl font-medium"
        >
          Settings
        </h2>
        <p className="m-0 max-w-[60ch] text-sm text-neutral-600 dark:text-neutral-400">
          Provider, model, and privacy controls. The same settings the popup
          exposes — laid out with room to read.
        </p>
      </header>
      <SettingsTab profile={profile} onChange={onChange} />
    </section>
  );
}

function NotificationsPlaceholder(): React.ReactElement {
  return (
    <section
      aria-labelledby="notifications-heading"
      className="flex flex-col gap-2"
      data-testid="tab-notifications-placeholder"
    >
      <h2
        id="notifications-heading"
        className="font-heading m-0 text-xl font-medium"
      >
        Notifications
      </h2>
      <p className="m-0 max-w-[60ch] text-sm text-neutral-600 dark:text-neutral-400">
        A full inbox of background events lands here once the notifications
        feature ships. Until then this section is reserved space so the rest of
        the tab view does not shift when it arrives.
      </p>
    </section>
  );
}

interface ProfileSyncLineProps {
  readonly status: ProfileSyncStatus | null;
}

function ProfileSyncLine({ status }: ProfileSyncLineProps): React.ReactElement {
  if (status === null) {
    return <p className="text-sm text-neutral-500">Checking native host…</p>;
  }
  if (status.source === "native-host") {
    return (
      <div className="flex flex-col gap-0.5 text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          <strong>native host (active).</strong> Reading and writing{" "}
          <code className="font-mono">~/.neurodock/profile.yaml</code>.
        </span>
        {status.detail ? (
          <span className="text-neutral-500">{status.detail}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="text-neutral-700 dark:text-neutral-300">
        <strong>extension-local.</strong> Profile lives only inside this
        browser.
      </span>
      <span className="text-neutral-600 dark:text-neutral-400">
        Install the native host to keep this extension in sync with{" "}
        <code className="font-mono">~/.neurodock/profile.yaml</code>:
      </span>
      <code className="select-all bg-neutral-100 px-2 py-1 font-mono dark:bg-neutral-800">
        pnpx @neurodock/native-host install
      </code>
    </div>
  );
}

interface ModeSummaryProps {
  readonly profile: ExtensionProfile;
}

function ModeSummary({ profile }: ModeSummaryProps): React.ReactElement {
  let label: string;
  if (profile.mode === "mock") {
    label = "Mock (developer-only). No model is called.";
  } else if (profile.mode === "cloud") {
    label =
      `Cloud (${profile.cloudProvider ?? "unconfigured"} · ` +
      `${profile.cloudModel ?? "no model"}). ` +
      "Text leaves your device.";
  } else {
    const which = profile.localProvider === "lmstudio" ? "LM Studio" : "Ollama";
    label = `Local ${which} (${
      profile.localModel || "no model"
    }). Text stays on your device.`;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-base text-neutral-700 dark:text-neutral-300">
        {label}
      </p>
      <p
        className="m-0 text-sm text-neutral-500"
        data-testid="tab-profile-identity"
      >
        Profile: <strong>{profile.displayName || "you"}</strong>
      </p>
    </div>
  );
}

function extractSourcePreview(entry: HistoryEntry): string {
  const input = entry.request?.input as Record<string, unknown> | undefined;
  if (input) {
    if (typeof input.text === "string" && input.text.length > 0) {
      return input.text;
    }
    if (typeof input.image_url === "string" && input.image_url.length > 0) {
      return input.image_url;
    }
    if (typeof input.transcript === "string" && input.transcript.length > 0) {
      return input.transcript;
    }
  }
  return entry.inputPreview;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
