/**
 * Inner TS payload for verify-phase2-watchdog. Loaded via tsx from the
 * extension-browser package so its module resolver is in scope.
 *
 * Imports the watchdog directly from the source and drives it with
 * synthesised histories to prove each of the three signals fires.
 */
import {
  DEFAULT_WATCHDOG_CONFIG,
  evaluateSignals,
  renderSignal,
  type WatchdogConfig,
  type WatchdogSignal,
} from "../packages/extension-browser/src/lib/proactive-watchdog.ts";
import type { HistoryEntry } from "../packages/extension-browser/src/lib/types.ts";

interface Check {
  readonly name: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly observed: string;
}

const config: WatchdogConfig = DEFAULT_WATCHDOG_CONFIG;
const checks: Check[] = [];

function record(
  name: string,
  passed: boolean,
  expected: string,
  observed: string,
): void {
  checks.push({ name, passed, expected, observed });
}

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: overrides.id ?? `e-${Math.random()}`,
    tool: overrides.tool ?? "translate_incoming",
    channel: overrides.channel ?? "generic",
    timestamp: overrides.timestamp ?? "2026-05-24T12:00:00.000Z",
    mode: overrides.mode ?? "local",
    mockMode: overrides.mockMode ?? false,
    provider: overrides.provider ?? "lmstudio",
    inputPreview: overrides.inputPreview ?? "preview",
    outputSummary: overrides.outputSummary ?? "ok",
    request: overrides.request,
    response: overrides.response,
  };
}

// ── 1. Hyperfocus ────────────────────────────────────────────────────────
{
  const now = new Date("2026-05-24T14:00:00.000Z");
  const history: HistoryEntry[] = Array.from(
    { length: config.hyperfocusThresholdCount },
    (_, i) =>
      entry({
        id: `h-${i}`,
        timestamp: new Date(now.getTime() - i * 60_000).toISOString(),
      }),
  );
  const signal = evaluateSignals(history, config, now);
  const ok =
    signal?.type === "hyperfocus" &&
    signal.count === config.hyperfocusThresholdCount;
  record(
    "evaluateSignals → hyperfocus",
    ok,
    `type='hyperfocus' and count=${config.hyperfocusThresholdCount}`,
    JSON.stringify(signal),
  );
  if (signal !== null) {
    const rendered = renderSignal(signal);
    const renderedOk =
      /hyperfocus/i.test(rendered.title) &&
      rendered.message.includes(String(config.hyperfocusThresholdCount)) &&
      rendered.message.includes(
        String(Math.round(config.hyperfocusWindowMs / 60000)),
      );
    record(
      "renderSignal → hyperfocus copy mentions count + window",
      renderedOk,
      "title matches /hyperfocus/i and message contains count + window minutes",
      JSON.stringify(rendered),
    );
  }
}

// ── 2. Deep-night ────────────────────────────────────────────────────────
{
  // Use local-time constructor (matches the watchdog's `now.getHours()`
  // usage which is local-hour).
  const now = new Date(2026, 4, 24, 2, 30, 0); // local May 24 02:30
  const justAfterMidnight = new Date(2026, 4, 24, 0, 5, 0);
  const history = [entry({ timestamp: justAfterMidnight.toISOString() })];
  const signal = evaluateSignals(history, config, now);
  const ok =
    signal?.type === "deep_night" &&
    signal.localHour === 2 &&
    signal.count >= 1;
  record(
    "evaluateSignals → deep_night",
    ok,
    "type='deep_night', localHour=2, count>=1",
    JSON.stringify(signal),
  );
  if (signal !== null) {
    const rendered = renderSignal(signal);
    const renderedOk =
      /late-night/i.test(rendered.title) &&
      rendered.message.includes("02:00") &&
      rendered.message.includes(
        String((signal as WatchdogSignal & { count: number }).count),
      );
    record(
      "renderSignal → deep_night copy mentions 02:00 + count",
      renderedOk,
      "title matches /late-night/i, message contains '02:00' + count",
      JSON.stringify(rendered),
    );
  }
}

// ── 3. Rumination on a single host ───────────────────────────────────────
{
  const now = new Date("2026-05-24T14:00:00.000Z");
  const history: HistoryEntry[] = Array.from(
    { length: config.ruminationThresholdCount },
    (_, i) =>
      entry({
        id: `r-${i}`,
        timestamp: new Date(now.getTime() - i * 5 * 60_000).toISOString(),
        request: {
          tool: "translate_incoming",
          input: { page_url: "https://www.linkedin.com/feed" },
        },
      }),
  );
  const signal = evaluateSignals(history, config, now);
  const ok =
    signal?.type === "rumination_host" &&
    signal.host === "www.linkedin.com" &&
    signal.count >= config.ruminationThresholdCount;
  record(
    "evaluateSignals → rumination_host",
    ok,
    `type='rumination_host', host='www.linkedin.com', count>=${config.ruminationThresholdCount}`,
    JSON.stringify(signal),
  );
  if (signal !== null) {
    const rendered = renderSignal(signal);
    // Note: this is a test assertion verifying the rendered banner mentions
    // the host. It is NOT URL sanitization — the host string is hard-coded
    // above for this verification harness. We use a word-boundary regex so
    // CodeQL's `js/incomplete-url-substring-sanitization` rule doesn't
    // mis-classify it as a security check.
    const renderedOk =
      /rumination/i.test(rendered.title) &&
      /\bwww\.linkedin\.com\b/.test(rendered.message);
    record(
      "renderSignal → rumination_host copy mentions host",
      renderedOk,
      "title matches /rumination/i, message contains 'www.linkedin.com'",
      JSON.stringify(rendered),
    );
  }
}

// ── 4. No-signal history ─────────────────────────────────────────────────
{
  const now = new Date("2026-05-24T14:00:00.000Z");
  // Empty history → no signal.
  const emptyResult = evaluateSignals([], config, now);
  record(
    "evaluateSignals → null on empty history",
    emptyResult === null,
    "null",
    JSON.stringify(emptyResult),
  );
  // Small history (under all thresholds, no page_url) → no signal.
  const small: HistoryEntry[] = Array.from({ length: 2 }, () =>
    entry({ timestamp: now.toISOString() }),
  );
  const smallResult = evaluateSignals(small, config, now);
  record(
    "evaluateSignals → null on sub-threshold history",
    smallResult === null,
    "null",
    JSON.stringify(smallResult),
  );
}

// ── Print summary ────────────────────────────────────────────────────────
console.log("\n=== Phase 2 (extension watchdog) verification ===\n");
let allPassed = true;
for (const c of checks) {
  const marker = c.passed ? "PASS" : "FAIL";
  if (!c.passed) allPassed = false;
  console.log(`[${marker}] ${c.name}`);
  console.log(`       expected: ${c.expected}`);
  console.log(`       observed: ${c.observed}`);
  console.log();
}
const passedN = checks.filter((c) => c.passed).length;
console.log(`Summary: ${passedN}/${checks.length} passed`);
process.exit(allPassed ? 0 : 1);
