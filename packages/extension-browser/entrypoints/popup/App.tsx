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
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultProfile,
  loadProfile,
  saveProfileWithOutcome,
  getSyncStatus,
  type ProfileSyncStatus,
} from "../../src/lib/profile.js";
import { CloudModeBanner } from "../../src/lib/cloud-mode-banner.js";
import { listHistory, clearHistory } from "../../src/lib/storage.js";
import {
  hasOcdOrAudhd,
  loadPacingPreferences,
  savePacingPreferences,
  type PacingPreferences,
} from "../../src/lib/pacing.js";
import type { ExtensionProfile, HistoryEntry } from "../../src/lib/types.js";
import { SettingsTab } from "./SettingsTab.js";
import { NotificationsTab } from "./NotificationsTab.js";
import { OnboardingWizard } from "./OnboardingWizard.js";
import { ToolView, SourcePreview } from "../_shared/panel.js";
import { OpenInTabButton } from "../../src/components/OpenInTabButton.js";
import {
  applyA11yToDocument,
  loadA11yPreferences,
} from "../../src/lib/accessibility.js";

function isHistoryUpdatedMessage(msg: unknown): boolean {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "history:updated"
  );
}

interface ProfileUpdatedMessage {
  readonly type: "profile:updated";
  readonly profile: ExtensionProfile;
}

function isProfileUpdatedMessage(msg: unknown): msg is ProfileUpdatedMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "profile:updated" &&
    typeof (msg as { profile?: unknown }).profile === "object" &&
    (msg as { profile?: unknown }).profile !== null
  );
}

type TabId = "home" | "notifications" | "settings";

export function App(): React.ReactElement {
  const [profile, setProfile] = useState<ExtensionProfile>(defaultProfile());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ProfileSyncStatus | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  // P1.2: surface save errors instead of swallowing them in `void onChange()`
  // callers. Previously a confirm-required prompt or a native-host hard
  // error returned silently and the popup carried on as if the save had
  // succeeded.
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshHistory = useCallback(async (): Promise<void> => {
    try {
      setHistory(await listHistory(20));
    } catch {
      // History view degrades to empty if IndexedDB is unavailable; the
      // toggle still works and the underlying writes will succeed once the
      // store recovers. Surfacing this would be noise.
      setHistory([]);
    }
  }, []);

  // RFC A3: load and apply accessibility preferences as soon as the
  // popup mounts so high-contrast / focus-mode classes land BEFORE the
  // profile load completes. A paint with the default theme followed by
  // a paint with the user's high-contrast preference would itself be
  // an accessibility regression.
  useEffect(() => {
    void (async () => {
      const a11y = await loadA11yPreferences();
      if (typeof document !== "undefined") {
        applyA11yToDocument(a11y, document);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const p = await loadProfile();
      setProfile(p);
      setLoaded(true);
      if (p.historyEnabled) {
        await refreshHistory();
      }
      try {
        setSyncStatus(await getSyncStatus());
      } catch {
        // Native-host probe failure leaves the sync status as "checking";
        // the Settings panel re-runs the probe on demand. No user-facing
        // surface for this in the popup root.
        setSyncStatus(null);
      }
    })();
  }, [refreshHistory]);

  // Live history updates while the popup is open. The service worker
  // broadcasts `history:updated` after every successful appendHistory.
  // Pre-0.0.7 the popup only read history on mount, so a translation
  // completing while the popup was open never appeared until the user
  // closed and re-opened it.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isHistoryUpdatedMessage(msg)) return;
      if (!profile.historyEnabled) return;
      void refreshHistory();
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [profile.historyEnabled, refreshHistory]);

  // P1.1: pick up profile saves originating from other popup windows.
  // `chrome.storage.onChanged` only fires for non-popup contexts;
  // sibling popups need this explicit broadcast (sent from
  // `saveProfileWithOutcome` in profile.ts).
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isProfileUpdatedMessage(msg)) return;
      setProfile(msg.profile);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const update = useCallback(
    async (patch: Partial<ExtensionProfile>) => {
      try {
        const outcome = await saveProfileWithOutcome(patch);
        setProfile(outcome.profile);
        if (outcome.error) {
          setSaveError(outcome.error);
        } else if (saveError) {
          setSaveError(null);
        }
      } catch (cause: unknown) {
        // chrome.storage.local hard rejection — extremely rare, but if it
        // happens we MUST tell the user. Silent failure here means the
        // change was never persisted and the popup shows stale state.
        const msg = cause instanceof Error ? cause.message : "Save failed";
        setSaveError(msg);
      }
    },
    [saveError],
  );

  const handleSwitchLocal = useCallback(() => {
    void update({ mode: "local" });
  }, [update]);

  const dismissSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  // 0.0.15: explicit "Clear history" surface in the Home tab. clearHistory()
  // exists in storage.ts but was never wired to the popup, so users who
  // turned history ON could never wipe it without disabling history (which
  // also blocks future writes). Clear separates "stop writing" from "wipe
  // what's there" so users can retain the feature with a clean slate.
  const handleClearHistory = useCallback(async (): Promise<void> => {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const yes = window.confirm(
        "Wipe all NeuroDock translation history? This cannot be undone.",
      );
      if (!yes) return;
    }
    try {
      await clearHistory();
      await refreshHistory();
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : "Clear failed";
      setSaveError(msg);
    }
  }, [refreshHistory]);

  return (
    <main className="text-fg flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-heading text-fg m-0 text-base font-medium">
            NeuroDock
          </h1>
          <p className="text-fg-muted m-0 text-sm">
            Decode subtext. Check tone. Local-first by default.
          </p>
        </div>
        <OpenInTabButton view={tab} />
      </header>

      <CloudModeBanner profile={profile} onSwitchToLocal={handleSwitchLocal} />

      {saveError !== null ? (
        <div
          role="alert"
          data-testid="popup-save-error"
          className="border-error-border bg-error-bg text-error-fg flex items-start justify-between gap-2 border p-2 text-sm"
        >
          <span>
            <strong>Save failed.</strong> {saveError}
          </span>
          <button
            type="button"
            onClick={dismissSaveError}
            className="border-error-border border px-2 py-0.5 text-xs"
            aria-label="Dismiss save error"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loaded && profile.onboardingComplete !== true ? (
        <OnboardingWizard
          profile={profile}
          onChange={update}
          onComplete={() => setTab("home")}
          onOpenSettings={() => setTab("settings")}
        />
      ) : (
        <>
          <PacingOptInPrompt profile={profile} />

          <TabBar current={tab} onChange={setTab} />

          {tab === "home" ? (
            <HomeTab
              profile={profile}
              history={history}
              onToggleHistory={(enabled) => update({ historyEnabled: enabled })}
              onClearHistory={handleClearHistory}
            />
          ) : null}
          {tab === "notifications" ? <NotificationsTab /> : null}
          {tab === "settings" ? (
            <SettingsTab profile={profile} onChange={update} />
          ) : null}
        </>
      )}

      {loaded && profile.onboardingComplete !== true ? null : (
        <section aria-labelledby="sync-heading" className="flex flex-col gap-1">
          <h2
            id="sync-heading"
            className="font-heading text-fg m-0 text-base font-medium"
          >
            Profile sync
          </h2>
          <ProfileSyncLine status={syncStatus} />
        </section>
      )}

      {loaded ? null : (
        <p className="text-fg-muted text-sm">Loading your profile…</p>
      )}
    </main>
  );
}

interface ProfileSyncLineProps {
  readonly status: ProfileSyncStatus | null;
}

function ProfileSyncLine({ status }: ProfileSyncLineProps): React.ReactElement {
  if (status === null) {
    return <p className="text-fg-muted text-sm">Checking native host…</p>;
  }
  if (status.source === "native-host") {
    return (
      <div className="text-fg-muted flex flex-col gap-0.5 text-sm">
        <span>
          <strong>Native host active.</strong> Reading and writing{" "}
          <code className="font-mono">~/.neurodock/profile.yaml</code>.
        </span>
        {status.detail ? <span>{status.detail}</span> : null}
      </div>
    );
  }
  return (
    <div className="border-hairline bg-bg-nav text-fg flex flex-col gap-1 border p-2 text-sm">
      <span>
        <strong>Extension-local.</strong> Profile lives only inside this
        browser.
      </span>
      <span className="text-fg-muted">
        Install the native host to keep this extension in sync with{" "}
        <code className="font-mono">~/.neurodock/profile.yaml</code>:
      </span>
      <code className="bg-bg-code border-hairline select-all border px-2 py-1 font-mono">
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
  // Sentence case per the design contract — every label lowercase
  // except the first word.
  const tabs: { id: TabId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "notifications", label: "Notifications" },
    { id: "settings", label: "Settings" },
  ];
  // RFC A3 — arrow-key navigation across the tab bar. Pattern follows
  // WAI-ARIA Authoring Practices for tabs: Left/Right (and Up/Down)
  // cycle, Home/End jump to first/last. Tab itself still moves focus
  // OUT of the tab bar into the panel below.
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({
    home: null,
    notifications: null,
    settings: null,
  });

  const focusTab = useCallback((id: TabId) => {
    const node = refs.current[id];
    if (node) node.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const order: TabId[] = ["home", "notifications", "settings"];
      const idx = order.indexOf(current);
      if (idx === -1) return;
      let nextId: TabId | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextId = order[(idx + 1) % order.length] ?? null;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextId = order[(idx - 1 + order.length) % order.length] ?? null;
      } else if (event.key === "Home") {
        nextId = order[0] ?? null;
      } else if (event.key === "End") {
        nextId = order[order.length - 1] ?? null;
      }
      if (nextId === null) return;
      event.preventDefault();
      onChange(nextId);
      focusTab(nextId);
    },
    [current, focusTab, onChange],
  );

  return (
    <nav
      aria-label="Popup sections"
      className="border-hairline flex gap-1 border-b"
    >
      <div
        role="tablist"
        aria-label="Popup sections"
        className="flex gap-1"
        onKeyDown={handleKeyDown}
        data-testid="popup-tab-list"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(node) => {
              refs.current[t.id] = node;
            }}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            tabIndex={current === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={
              "-mb-px border-b-2 px-3 py-1 text-sm " +
              (current === t.id
                ? "border-accent text-fg-accent font-medium"
                : "text-fg-muted hover:text-fg border-transparent")
            }
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

interface HomeTabProps {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly onToggleHistory: (enabled: boolean) => void;
  readonly onClearHistory: () => Promise<void> | void;
}

function HomeTab({
  profile,
  history,
  onToggleHistory,
  onClearHistory,
}: HomeTabProps): React.ReactElement {
  return (
    <>
      <section aria-labelledby="status-heading" className="flex flex-col gap-2">
        <h2
          id="status-heading"
          className="font-heading text-fg m-0 text-base font-medium"
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
          className="font-heading text-fg m-0 text-base font-medium"
        >
          History
        </h2>
        <HistoryPanel
          profile={profile}
          history={history}
          onToggle={onToggleHistory}
          onClear={onClearHistory}
        />
      </section>
    </>
  );
}

interface ModeSummaryProps {
  readonly profile: ExtensionProfile;
}

function ModeSummary({ profile }: ModeSummaryProps): React.ReactElement {
  // 0.0.15: ModeSummary now reflects the actual local provider (Ollama vs
  // LM Studio) and surfaces the display_name from the profile so a user
  // who just ran the native-host sync can see at a glance which profile
  // is currently loaded (#2 in the 2026-05-23 user feedback).
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
    <div className="flex flex-col gap-0.5">
      <p className="text-fg m-0 text-sm">{label}</p>
      <p className="text-fg-muted m-0 text-sm" data-testid="profile-identity">
        Profile: <strong>{profile.displayName || "you"}</strong>
      </p>
    </div>
  );
}

interface HistoryPanelProps {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly onToggle: (enabled: boolean) => void;
  readonly onClear: () => Promise<void> | void;
}

function HistoryPanel({
  profile,
  history,
  onToggle,
  onClear,
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
      {history.length > 0 ? (
        <button
          type="button"
          onClick={() => void onClear()}
          data-testid="clear-history"
          className="border-hairline bg-bg text-fg hover:bg-bg-nav self-start border px-2 py-0.5 text-sm"
          aria-label="Wipe all NeuroDock translation history"
        >
          Wipe history ({history.length})
        </button>
      ) : null}
      {profile.historyEnabled && history.length === 0 ? (
        <p className="text-fg-muted text-sm">
          No translations yet. Right-click selected text or an image on a
          supported site to start.
        </p>
      ) : null}
      {profile.historyEnabled && history.length > 0 ? (
        <HistoryList history={history} />
      ) : null}
    </div>
  );
}

interface HistoryListProps {
  readonly history: readonly HistoryEntry[];
}

function HistoryList({ history }: HistoryListProps): React.ReactElement {
  // 0.0.21: rows are now click-to-expand. Pre-0.0.21 they showed only a
  // tool/timestamp/provider line and the user had no way to read the
  // actual result — the notifications that said "open History to see
  // the translation" pointed at a dead-end list. Each row now stores
  // the full response (sanitised — base64 snapshots are stripped), so
  // expanding renders the same structured view the in-page panel uses.
  //
  // Only one row open at a time to keep scroll predictable; clicking
  // an open row collapses it.
  const [openId, setOpenId] = useState<string | null>(null);
  const fellBack = (entry: HistoryEntry): boolean =>
    entry.mockMode === true &&
    typeof entry.provider === "string" &&
    entry.provider !== "mock";
  const latest = history[0];
  const latestFallback = latest ? fellBack(latest) : false;
  return (
    <>
      {latestFallback && latest ? (
        <div className="border-warn-border bg-warn-bg text-warn-fg mb-2 border p-2 text-sm">
          <strong>Heads up.</strong> Your selected provider (
          <code>{latest.provider}</code>) was unreachable, so the extension fell
          back to the mock provider. Open Settings then Test to diagnose.
        </div>
      ) : null}
      <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-auto p-0 text-sm">
        {history.map((entry) => {
          const providerLabel = entry.provider ?? "unknown";
          const fallbackHere = fellBack(entry);
          const expanded = openId === entry.id;
          const expandable = entry.response !== undefined;
          return (
            <li key={entry.id} className="border-hairline border-b pb-1">
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : entry.id)}
                disabled={!expandable}
                aria-expanded={expanded}
                aria-controls={`history-row-${entry.id}`}
                className={
                  "flex w-full items-center justify-between gap-2 border-0 bg-transparent p-0 text-left " +
                  (expandable
                    ? "hover:text-fg-accent cursor-pointer"
                    : "cursor-default opacity-80")
                }
                data-testid={`history-row-toggle-${entry.tool}`}
              >
                <div>
                  <div className="text-fg font-mono">{entry.tool}</div>
                  <div className="text-fg-muted">
                    {formatTimestamp(entry.timestamp)} · {entry.mode} ·{" "}
                    {fallbackHere ? (
                      <span className="text-warn-fg">
                        {providerLabel} → mock (fallback)
                      </span>
                    ) : (
                      providerLabel
                    )}
                  </div>
                </div>
                {expandable ? (
                  <span aria-hidden="true" className="text-fg-muted">
                    {expanded ? "▾" : "▸"}
                  </span>
                ) : null}
              </button>
              {expanded && entry.response ? (
                <div
                  id={`history-row-${entry.id}`}
                  className="border-hairline mt-2 border-l-2 pl-2"
                  data-testid="history-row-detail"
                >
                  <HistoryEntryDetail entry={entry} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface HistoryEntryDetailProps {
  readonly entry: HistoryEntry;
}

function HistoryEntryDetail({
  entry,
}: HistoryEntryDetailProps): React.ReactElement {
  const response = entry.response;
  if (!response) {
    return (
      <p className="text-fg-muted text-sm">
        (No detail saved for this row. It was written before NeuroDock started
        persisting full responses.)
      </p>
    );
  }
  const sourceText = extractSourcePreview(entry);
  return (
    <div className="flex flex-col gap-2">
      {sourceText.length > 0 ? <SourcePreview text={sourceText} /> : null}
      {response.ok && response.data !== null ? (
        <ToolView
          tool={response.tool}
          data={response.data as Record<string, unknown>}
        />
      ) : (
        <p className="text-error-fg text-sm">
          Error: {response.error ?? "Unknown error"}
        </p>
      )}
      <p className="text-fg-muted text-sm">
        via {response.provenance.provider} · {response.provenance.model} ·{" "}
        {response.provenance.mode}
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
    // Locale-default short form; readable enough for the history list
    // without flooding the row with full ISO ms precision.
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

// ──────────────────────────────────────────────────────────────────────
// PacingOptInPrompt (RFC B3).
//
// One-time opt-in surface for users with `ocd` or `audhd` in their
// neurotypes. Pacing prompts can feed rumination loops for those
// users, so default is OFF and the popup must explicitly ask before
// any nudges fire. Dismissable in either direction (Enable / Not now);
// either path sets `ocdOptInShown = true` so the prompt does not
// render again.
// ──────────────────────────────────────────────────────────────────────

interface PacingOptInPromptProps {
  readonly profile: ExtensionProfile;
}

export function PacingOptInPrompt({
  profile,
}: PacingOptInPromptProps): React.ReactElement | null {
  const [prefs, setPrefs] = useState<PacingPreferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadPacingPreferences(profile.neurotypes);
      if (!cancelled) setPrefs(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.neurotypes]);

  const respond = useCallback(
    async (enabled: boolean) => {
      if (prefs === null) return;
      const next: PacingPreferences = {
        ...prefs,
        enabled,
        ocdOptInShown: true,
        schemaVersion: 1,
      };
      setPrefs(next);
      try {
        await savePacingPreferences(next);
      } catch {
        setPrefs(prefs);
      }
    },
    [prefs],
  );

  if (prefs === null) return null;
  if (!hasOcdOrAudhd(profile.neurotypes)) return null;
  if (prefs.ocdOptInShown) return null;

  return (
    <section
      role="region"
      aria-label="Pacing copilot opt-in"
      data-testid="pacing-opt-in-prompt"
      className="border-warn-border bg-warn-bg text-warn-fg flex flex-col gap-2 border p-3 text-sm"
    >
      <div className="font-medium">Enable pacing nudges?</div>
      <p className="m-0">
        We can suggest a short break during long stretches. Default is off for
        your neurotype because pacing prompts can feed rumination loops. You can
        change this any time in Settings.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void respond(true)}
          data-testid="pacing-opt-in-enable"
          className="border-hairline bg-bg text-fg border px-2 py-0.5"
        >
          Enable
        </button>
        <button
          type="button"
          onClick={() => void respond(false)}
          data-testid="pacing-opt-in-dismiss"
          className="border-hairline bg-bg text-fg border px-2 py-0.5"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
