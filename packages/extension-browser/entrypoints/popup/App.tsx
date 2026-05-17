/**
 * Popup root component.
 *
 * Three sections, top to bottom:
 *   1. Cloud-mode banner (when mode === "cloud"). Persistent. Plan.md §7.
 *   2. Mode toggle — local / cloud. Cloud requires a provider id; we surface
 *      the consent text inline and require an explicit checkbox before the
 *      mode switch sticks.
 *   3. Local-only history list (off by default; toggle to enable).
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

export function App(): React.ReactElement {
  const [profile, setProfile] = useState<ExtensionProfile>(defaultProfile());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ProfileSyncStatus | null>(null);

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

      <section aria-labelledby="mode-heading" className="flex flex-col gap-2">
        <h2 id="mode-heading" className="font-heading m-0 text-base font-medium">
          Mode
        </h2>
        <ModeToggle profile={profile} onChange={update} />
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="font-heading m-0 text-base font-medium">
          History
        </h2>
        <HistoryPanel
          profile={profile}
          history={history}
          onToggle={(enabled) => update({ historyEnabled: enabled })}
        />
      </section>

      <section aria-labelledby="sync-heading" className="flex flex-col gap-1">
        <h2 id="sync-heading" className="font-heading m-0 text-base font-medium">
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
          <strong>native host (active).</strong>{" "}
          Reading and writing{" "}
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

interface ModeToggleProps {
  readonly profile: ExtensionProfile;
  readonly onChange: (patch: Partial<ExtensionProfile>) => Promise<void>;
}

function ModeToggle({ profile, onChange }: ModeToggleProps): React.ReactElement {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border border-neutral-200 p-3 dark:border-neutral-800">
      <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        Where translation runs
      </legend>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="mode"
          value="local"
          checked={profile.mode === "local"}
          onChange={() => void onChange({ mode: "local" })}
        />
        <span>Local (default). No text leaves your device.</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="mode"
          value="cloud"
          checked={profile.mode === "cloud"}
          onChange={() => {
            if (!profile.cloudProvider) {
              alert(
                "Set a cloud provider id below before enabling cloud mode. " +
                  "Cloud mode requires explicit consent per call."
              );
              return;
            }
            void onChange({ mode: "cloud" });
          }}
        />
        <span>
          Cloud (opt-in). Text leaves your device for the configured provider.
        </span>
      </label>
      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Cloud provider id
        </span>
        <input
          type="text"
          value={profile.cloudProvider ?? ""}
          placeholder="anthropic, openai, …"
          onChange={(e) =>
            void onChange({
              cloudProvider: e.target.value.length === 0 ? null : e.target.value,
            })
          }
          className="border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
    </fieldset>
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
