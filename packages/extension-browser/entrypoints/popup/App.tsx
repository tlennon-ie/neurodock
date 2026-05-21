/**
 * Popup root component.
 *
 * Tabs (v0.0.2):
 *   1. Home — cloud-mode banner, mode summary, history list.
 *   2. Settings — provider selection (Local Ollama / Cloud Anthropic /
 *      Cloud OpenAI / Cloud OpenRouter / Mock), endpoint URL, model
 *      name, API key entry, and a Test button. See SettingsTab.tsx.
 *
 * Voice (plan.md §2): direct, plain, non-clinical. No "superpower" copy.
 * No diagnosis-gated language.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  defaultProfile,
  loadProfile,
  saveProfile,
  getSyncStatus,
  type ProfileSyncStatus,
} from "../../src/lib/profile.js";
import { CloudModeBanner } from "../../src/lib/cloud-mode-banner.js";
import { listHistory } from "../../src/lib/storage.js";
import type { ExtensionProfile, HistoryEntry } from "../../src/lib/types.js";
import { SettingsTab } from "./SettingsTab.js";

type TabId = "home" | "settings";

export function App(): React.ReactElement {
  const [profile, setProfile] = useState<ExtensionProfile>(defaultProfile());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ProfileSyncStatus | null>(null);
  const [tab, setTab] = useState<TabId>("home");

  useEffect(() => {
    void (async () => {
      const p = await loadProfile();
      setProfile(p);
      setLoaded(true);
      if (p.historyEnabled) {
        try {
          setHistory(await listHistory(20));
        } catch {
          setHistory([]);
        }
      }
      try {
        setSyncStatus(await getSyncStatus());
      } catch {
        setSyncStatus(null);
      }
    })();
  }, []);

  const update = useCallback(async (patch: Partial<ExtensionProfile>) => {
    const next = await saveProfile(patch);
    setProfile(next);
  }, []);

  const handleSwitchLocal = useCallback(() => {
    void update({ mode: "local" });
  }, [update]);

  return (
    <main className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="font-heading m-0 text-lg font-medium">NeuroDock</h1>
        <p className="m-0 text-sm text-neutral-600 dark:text-neutral-400">
          Decode subtext. Check tone. Local-first by default.
        </p>
      </header>

      <CloudModeBanner profile={profile} onSwitchToLocal={handleSwitchLocal} />

      <TabBar current={tab} onChange={setTab} />

      {tab === "home" ? (
        <HomeTab
          profile={profile}
          history={history}
          onToggleHistory={(enabled) => update({ historyEnabled: enabled })}
        />
      ) : (
        <SettingsTab profile={profile} onChange={update} />
      )}

      <section aria-labelledby="sync-heading" className="flex flex-col gap-1">
        <h2
          id="sync-heading"
          className="font-heading m-0 text-base font-medium"
        >
          Profile sync
        </h2>
        <ProfileSyncLine status={syncStatus} />
      </section>

      {loaded ? null : (
        <p className="text-xs text-neutral-500">Loading your profile…</p>
      )}
    </main>
  );
}

interface ProfileSyncLineProps {
  readonly status: ProfileSyncStatus | null;
}

function ProfileSyncLine({ status }: ProfileSyncLineProps): React.ReactElement {
  if (status === null) {
    return <p className="text-xs text-neutral-500">Checking native host…</p>;
  }
  if (status.source === "native-host") {
    return (
      <div className="flex flex-col gap-0.5 text-xs text-neutral-600 dark:text-neutral-400">
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
    <div className="flex flex-col gap-1 border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
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

interface TabBarProps {
  readonly current: TabId;
  readonly onChange: (next: TabId) => void;
}

function TabBar({ current, onChange }: TabBarProps): React.ReactElement {
  const tabs: { id: TabId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <nav
      aria-label="Popup sections"
      className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={current === t.id}
          onClick={() => onChange(t.id)}
          className={
            "border-b-2 px-3 py-1 text-sm " +
            (current === t.id
              ? "border-neutral-900 dark:border-neutral-100"
              : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100")
          }
          data-testid={`tab-${t.id}`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

interface HomeTabProps {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly onToggleHistory: (enabled: boolean) => void;
}

function HomeTab({
  profile,
  history,
  onToggleHistory,
}: HomeTabProps): React.ReactElement {
  return (
    <>
      <section aria-labelledby="status-heading" className="flex flex-col gap-2">
        <h2
          id="status-heading"
          className="font-heading m-0 text-base font-medium"
        >
          Status
        </h2>
        <ModeSummary profile={profile} />
      </section>

      <section
        aria-labelledby="history-heading"
        className="flex flex-col gap-2"
      >
        <h2
          id="history-heading"
          className="font-heading m-0 text-base font-medium"
        >
          History
        </h2>
        <HistoryPanel
          profile={profile}
          history={history}
          onToggle={onToggleHistory}
        />
      </section>
    </>
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
    label = `Local Ollama (${profile.localModel}). Text stays on your device.`;
  }
  return (
    <p className="m-0 text-sm text-neutral-700 dark:text-neutral-300">
      {label}
    </p>
  );
}

interface HistoryPanelProps {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly onToggle: (enabled: boolean) => void;
}

function HistoryPanel({
  profile,
  history,
  onToggle,
}: HistoryPanelProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={profile.historyEnabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          Keep a local history of translations (metadata only, never sent
          anywhere).
        </span>
      </label>
      {profile.historyEnabled && history.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No translations yet. Right-click selected text on a supported site to
          start.
        </p>
      ) : null}
      {profile.historyEnabled && history.length > 0 ? (
        <ul className="m-0 flex max-h-48 list-none flex-col gap-1 overflow-auto p-0 text-xs">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="border-b border-neutral-200 pb-1 dark:border-neutral-800"
            >
              <div className="font-mono">{entry.tool}</div>
              <div className="text-neutral-500">
                {entry.timestamp} · {entry.mode}
                {entry.mockMode ? " · mock" : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
