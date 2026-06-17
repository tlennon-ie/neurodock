#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""NeuroDock proactive guardrail — Claude Code hook (self-contained).

Bundled with `@neurodock/cli`; copied to `~/.neurodock/hooks/` by
`neurodock install-hooks`. Pure stdlib — no pip install, no MCP server
required. Heuristics vendored from packages/mcp-guardrail so the hook
keeps working when MCP servers aren't running yet.

Hook events handled (Claude Code subcommand args):

  session-start  Track session start time + clock band; emit a banner
                 if we're in the deep-night band.
  pre-tool       Record the current user prompt; every Nth tool use,
                 evaluate hyperfocus + rumination and emit banners.
  post-tool      Detect sycophancy patterns in assistant responses.
  stop           Mark session end; clear in-flight state.

How banners reach the user (0.0.2):

  Banners are surfaced through Claude Code's structured hook output —
  a single JSON object printed to STDOUT carrying a `systemMessage`
  field, with the process exiting 0. That is the documented
  non-blocking, user-visible channel. The pre-0.0.2 hook wrote the
  banner to stderr and exited 0, which only shows in transcript/verbose
  mode — so every fired banner was effectively invisible during normal
  use. We never use exit 2 (that BLOCKS the tool call) — the guardrail
  must never block the user's work.

Profile-driven thresholds (0.0.2):

  The hook reads `~/.neurodock/profile.yaml` (honouring
  $NEURODOCK_PROFILE_PATH and $XDG_CONFIG_HOME like the CLI) and uses
  the user's own `chronometric.hyperfocus_break_minutes`,
  `chronometric.end_of_day_local`, `guardrails.rumination_threshold`,
  `guardrails.rumination_window_minutes`, and
  `guardrails.sycophancy_check`. Pure-stdlib scalar extraction — no
  YAML dependency. Missing/invalid values fall back to the defaults
  below.

Wire-up in `~/.claude/settings.json`:

  {
    "hooks": {
      "SessionStart": [
        {"hooks": [{"type": "command", "command": "python ~/.neurodock/hooks/proactive_guardrail.py session-start"}]}
      ],
      "PreToolUse": [
        {"hooks": [{"type": "command", "command": "python ~/.neurodock/hooks/proactive_guardrail.py pre-tool"}]}
      ],
      "PostToolUse": [
        {"hooks": [{"type": "command", "command": "python ~/.neurodock/hooks/proactive_guardrail.py post-tool"}]}
      ],
      "Stop": [
        {"hooks": [{"type": "command", "command": "python ~/.neurodock/hooks/proactive_guardrail.py stop"}]}
      ]
    }
  }

`neurodock install-hooks` writes this idempotently.

Opt-out: set `NEURODOCK_GUARDRAILS=off` in the environment, or delete
the `hooks` entries from `settings.json`. The hook is silent by
default unless a heuristic actually trips.

State files (all under `~/.neurodock/state/`):

  guardrail-session.json   - {started_at, intent, tool_count}
  guardrail-prompts.json   - rolling list of {at, text} for rumination
  guardrail-log.jsonl      - audit trail (every banner emitted)

The hook NEVER blocks the user's work. Any internal error is logged
and swallowed.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

# ── Configuration ────────────────────────────────────────────────────────

VERSION = "0.0.2"
STATE_DIR = Path.home() / ".neurodock" / "state"
LOG_FILE = STATE_DIR / "guardrail-log.jsonl"
SESSION_FILE = STATE_DIR / "guardrail-session.json"
PROMPTS_FILE = STATE_DIR / "guardrail-prompts.json"

# Banners accumulated during a single hook invocation. A hook fires once
# per event and may produce more than one banner (e.g. pre-tool can trip
# both hyperfocus and rumination), but Claude Code accepts exactly one
# JSON object on stdout — so we collect here and flush once in main().
_PENDING_BANNERS: list[str] = []

# Valid profile ranges (mirrors packages/core/schemas/profile.example.yaml).
# Out-of-range values are clamped, not rejected — the hook stays charitable
# and predictable; `neurodock profile validate` is where ranges are enforced.
HYPERFOCUS_BREAK_MIN_RANGE = (15, 240)
RUMINATION_THRESHOLD_RANGE = (1, 20)
RUMINATION_WINDOW_RANGE = (5, 1440)

# Hyperfocus heuristic — mirrors packages/mcp-guardrail/heuristics/hyperfocus.py
HYPERFOCUS_BREAK_MINUTES_DEFAULT = 90
HYPERFOCUS_GENTLE_RATIO = 0.60  # 54 min
HYPERFOCUS_NUDGE_RATIO = 1.00  # 90 min
HYPERFOCUS_HARD_RATIO = 4.0 / 3.0  # 120 min

# Rumination heuristic — Jaccard similarity over normalised word sets.
RUMINATION_WINDOW_MINUTES_DEFAULT = 90
RUMINATION_THRESHOLD_DEFAULT = 3
RUMINATION_SIMILARITY_DEFAULT = 0.55  # tuned per mcp-guardrail tests

# Don't run heuristics on every single tool call — that 4x's the hook
# latency. Every Nth PreToolUse instead.
PRETOOL_CHECK_EVERY_N = 5

# Cap prompt-history file so it doesn't grow forever.
MAX_PROMPT_HISTORY = 200

# Deep-night / late-night clock bands trigger an early-warning banner
# at session-start. End-of-day defaults align with `profile.example.yaml`.
DEEP_NIGHT_HOURS = range(0, 6)  # 00:00..05:59 local
LATE_NIGHT_HOURS = range(22, 24)  # 22:00..23:59 local


# ── Main dispatch ────────────────────────────────────────────────────────


def main() -> int:
    if os.environ.get("NEURODOCK_GUARDRAILS", "").lower() == "off":
        return 0
    if len(sys.argv) < 2:
        return 0
    kind = sys.argv[1]
    # Self-test is a standalone diagnostic — no stdin payload, no state
    # directory, no banner flush. Handle it before anything else.
    if kind == "self-test":
        return _self_test()
    payload = _read_stdin_payload()
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        return 0  # filesystem unavailable — fail silent
    settings = _load_profile_settings()
    try:
        if kind == "session-start":
            _on_session_start(payload, settings)
        elif kind == "pre-tool":
            _on_pre_tool(payload, settings)
        elif kind == "post-tool":
            _on_post_tool(payload, settings)
        elif kind == "stop":
            _on_stop(payload)
    except Exception as exc:
        _log("error", {"kind": kind, "error": str(exc)})
    # Flush any banners the handlers queued, as one JSON object on stdout.
    _flush_banners()
    return 0


# ── Hook handlers ────────────────────────────────────────────────────────


def _on_session_start(_payload: dict[str, Any], settings: dict[str, Any]) -> None:
    now = _now()
    state = _load_session()
    state["started_at"] = now.isoformat()
    state["tool_count"] = 0
    _save_session(state)
    band = _clock_band(now)
    break_minutes = settings.get(
        "hyperfocus_break_minutes", HYPERFOCUS_BREAK_MINUTES_DEFAULT
    )
    if band in ("deep_night", "late_night"):
        _emit_banner(
            f"NeuroDock: it's {band.replace('_', ' ')} local time. "
            f"I'll nudge you toward stopping every "
            f"{break_minutes} minutes."
        )
    _log("session-start", {"band": band})


def _on_pre_tool(payload: dict[str, Any], settings: dict[str, Any]) -> None:
    state = _load_session()
    # Defensive bootstrap: if SessionStart never fired (e.g. hook installed
    # mid-session, or the Claude Code event is suppressed in a given client),
    # the elapsed-time heuristics need an anchor. Set started_at on the first
    # PreToolUse rather than silently degrade. The user's 2026-05-26 silent-
    # failure incident hit exactly this path — state had {tool_count: N} with
    # no started_at, so _evaluate_hyperfocus returned None forever.
    if not isinstance(state.get("started_at"), str):
        state["started_at"] = _now().isoformat()
        _log("session-bootstrap", {"reason": "missing-started_at"})
    state["tool_count"] = int(state.get("tool_count", 0)) + 1
    state["last_active_at"] = _now().isoformat()
    _save_session(state)

    prompt = _extract_user_prompt(payload)
    if prompt:
        _record_prompt(prompt)

    if state["tool_count"] % PRETOOL_CHECK_EVERY_N != 0:
        return

    break_minutes = settings.get(
        "hyperfocus_break_minutes", HYPERFOCUS_BREAK_MINUTES_DEFAULT
    )
    end_of_day = settings.get("end_of_day_local")
    hyperfocus_banner = _evaluate_hyperfocus(state, break_minutes, end_of_day)
    if hyperfocus_banner:
        _emit_banner(hyperfocus_banner)
    threshold = settings.get("rumination_threshold", RUMINATION_THRESHOLD_DEFAULT)
    window = settings.get(
        "rumination_window_minutes", RUMINATION_WINDOW_MINUTES_DEFAULT
    )
    rumination_banner = _evaluate_rumination(threshold, window)
    if rumination_banner:
        _emit_banner(rumination_banner)


def _on_post_tool(payload: dict[str, Any], settings: dict[str, Any]) -> None:
    # Honour the user's sycophancy preference: "off" means never flag.
    # "warn"/"refuse" both surface the advisory banner (the hook never
    # refuses a send — that's a client-side decision).
    if settings.get("sycophancy_check") == "off":
        return
    response = _extract_assistant_response(payload)
    if not response:
        return
    sycophancy_banner = _evaluate_sycophancy(response)
    if sycophancy_banner:
        _emit_banner(sycophancy_banner)


def _on_stop(_payload: dict[str, Any]) -> None:
    state = _load_session()
    started = state.get("started_at")
    duration_min: int | None = None
    if isinstance(started, str):
        try:
            elapsed = _now() - datetime.fromisoformat(started)
            duration_min = int(elapsed.total_seconds() // 60)
        except Exception as exc:
            _log("session-end-parse-error", {"error": str(exc)})
    _save_session({})  # clear
    _log("session-end", {"duration_min": duration_min})


# ── Heuristics (vendored from packages/mcp-guardrail) ────────────────────


def _evaluate_hyperfocus(
    state: dict[str, Any],
    break_minutes: int = HYPERFOCUS_BREAK_MINUTES_DEFAULT,
    end_of_day_local: str | None = None,
) -> str | None:
    """Elapsed-threshold heuristic; mirrors mcp-guardrail's structure.

    `break_minutes` re-anchors the escalation ladder (from
    `chronometric.hyperfocus_break_minutes`). `end_of_day_local`
    ("HH:MM") makes the nudge stricter after the user's clock-out time;
    when absent we fall back to the deep/late-night clock band.
    """
    started_iso = state.get("started_at")
    if not isinstance(started_iso, str):
        return None
    try:
        started = datetime.fromisoformat(started_iso)
    except ValueError:
        return None
    now = _now()
    elapsed = now - started
    elapsed_min = elapsed.total_seconds() / 60.0

    gentle = break_minutes * HYPERFOCUS_GENTLE_RATIO
    nudge = break_minutes * HYPERFOCUS_NUDGE_RATIO
    hard = break_minutes * HYPERFOCUS_HARD_RATIO

    past_eod = _is_past_end_of_day(now, end_of_day_local)

    level: str
    if elapsed_min < gentle:
        level = "none"
    elif elapsed_min < nudge:
        level = "gentle"
    elif elapsed_min < hard:
        level = "nudge"
    else:
        level = "hard"
    # End-of-day escalates one rung.
    if past_eod and level == "gentle":
        level = "nudge"
    elif past_eod and level == "nudge":
        level = "hard"

    if level == "none":
        return None

    elapsed_label = f"{int(elapsed_min)} min"
    if level == "gentle":
        return (
            f"NeuroDock hyperfocus check ({elapsed_label}): consider standing up, "
            "hydrating, looking 20ft away for 20 seconds."
        )
    if level == "nudge":
        return (
            f"NeuroDock hyperfocus check ({elapsed_label}): worth taking a real "
            "break — walk outside, switch context for 10 minutes."
        )
    return (
        f"NeuroDock hyperfocus check ({elapsed_label}): you've crossed the "
        "hard threshold. Save your work and stop for the day."
    )


def _evaluate_rumination(
    threshold: int = RUMINATION_THRESHOLD_DEFAULT,
    window_minutes: int = RUMINATION_WINDOW_MINUTES_DEFAULT,
) -> str | None:
    """Jaccard-similarity rumination detector across recent prompts.

    `threshold` and `window_minutes` come from `guardrails.*` in the
    profile; both fall back to the module defaults.
    """
    prompts = _load_prompts()
    if len(prompts) < threshold:
        return None
    window_start = _now() - timedelta(minutes=window_minutes)
    recent = [p for p in prompts if _parse_iso(p.get("at", "")) >= window_start]
    if len(recent) < threshold:
        return None
    # Compare the latest prompt to the others.
    latest = recent[-1]["text"]
    matches = 0
    for prior in recent[:-1]:
        sim = _jaccard_similarity(latest, prior["text"])
        if sim >= RUMINATION_SIMILARITY_DEFAULT:
            matches += 1
    if matches < threshold - 1:
        return None
    return (
        f"NeuroDock rumination check: you've asked a variant of this question "
        f"{matches + 1} times in the last {window_minutes} "
        "minutes. Want to step back, or are you finding what you need?"
    )


def _evaluate_sycophancy(response: str) -> str | None:
    """Lightweight sycophancy detector — opens with absolute agreement +
    no trade-off named. Conservative; designed to fire rarely."""
    if len(response) < 60:
        return None
    opener = response.lstrip()[:200].lower()
    absolutes = [
        "absolutely",
        "exactly right",
        "you're right",
        "you are right",
        "great point",
        "excellent point",
        "perfect",
        "spot on",
        "100%",
        "100 percent",
    ]
    hits = [phrase for phrase in absolutes if phrase in opener]
    if not hits:
        return None
    # If the response contains a trade-off marker, treat it as balanced.
    tradeoff_markers = [
        "however",
        "trade-off",
        "tradeoff",
        "downside",
        "but ",
        "although",
        "the cost is",
        "the risk is",
    ]
    if any(marker in response.lower() for marker in tradeoff_markers):
        return None
    return (
        "NeuroDock sycophancy check: Claude's response opens with "
        f"'{hits[0]}' and names no trade-off. Push back if you disagree."
    )


def _jaccard_similarity(a: str, b: str) -> float:
    set_a = _normalise_for_similarity(a)
    set_b = _normalise_for_similarity(b)
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


_STOP_WORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "shall",
        "can",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "with",
        "by",
        "from",
        "as",
        "if",
        "then",
        "else",
        "when",
        "where",
        "why",
        "how",
        "what",
        "which",
        "who",
        "this",
        "that",
        "these",
        "those",
        "i",
        "you",
        "he",
        "she",
        "it",
        "we",
        "they",
        "me",
        "him",
        "her",
        "us",
        "them",
        "my",
        "your",
        "his",
        "its",
        "our",
        "their",
    }
)


def _normalise_for_similarity(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {t for t in tokens if len(t) > 2 and t not in _STOP_WORDS}


# ── Clock bands ──────────────────────────────────────────────────────────


def _clock_band(now: datetime) -> str:
    hour = now.hour
    if hour in DEEP_NIGHT_HOURS:
        return "deep_night"
    if hour in LATE_NIGHT_HOURS:
        return "late_night"
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def _now() -> datetime:
    return datetime.now(UTC).astimezone()


def _is_past_end_of_day(now: datetime, end_of_day_local: str | None) -> bool:
    """True if `now` is at/after the user's clock-out time, or in deep night.

    When `end_of_day_local` ("HH:MM") is set, the hyperfocus nudge gets
    stricter after that time (documented behaviour). When it is absent or
    malformed, fall back to the deep/late-night clock band so behaviour is
    unchanged for users who never set it.
    """
    if not isinstance(end_of_day_local, str):
        return _clock_band(now) in ("late_night", "deep_night")
    match = re.match(r"^\s*(\d{1,2}):(\d{2})\s*$", end_of_day_local)
    if match is None:
        return _clock_band(now) in ("late_night", "deep_night")
    hour, minute = int(match.group(1)), int(match.group(2))
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return _clock_band(now) in ("late_night", "deep_night")
    # Deep night (00:00-05:59) is always "past end of day" regardless of the
    # configured clock-out — nobody sets end_of_day to 03:00 and means it.
    if now.hour < 6:
        return True
    eod_minutes = hour * 60 + minute
    now_minutes = now.hour * 60 + now.minute
    return now_minutes >= eod_minutes


# ── Profile (stdlib-only scalar extraction from profile.yaml) ────────────


def _profile_path() -> Path:
    """Resolve profile.yaml with the same precedence as the CLI
    (packages/cli/src/lib/paths.ts):
      1. $NEURODOCK_PROFILE_PATH
      2. $XDG_CONFIG_HOME/neurodock/profile.yaml
      3. ~/.neurodock/profile.yaml
    """
    override = os.environ.get("NEURODOCK_PROFILE_PATH", "").strip()
    if override:
        return Path(override)
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    if xdg:
        return Path(xdg) / "neurodock" / "profile.yaml"
    return Path.home() / ".neurodock" / "profile.yaml"


def _load_profile_settings() -> dict[str, Any]:
    """Read the user's profile and return the guardrail-relevant scalars.

    Never raises: a missing/unreadable/invalid profile yields {} and the
    callers fall back to the module defaults.
    """
    try:
        path = _profile_path()
        text = path.read_text(encoding="utf-8")
    except (OSError, ValueError):
        return {}
    try:
        return _parse_profile_text(text)
    except Exception as exc:  # never let a parse bug break a tool call
        _log("profile-parse-error", {"error": str(exc)})
        return {}


def _parse_profile_text(text: str) -> dict[str, Any]:
    """Pure scalar extraction from profile YAML — no YAML dependency.

    The hook is stdlib-only (no pip install), and we only need a handful
    of leaf scalars whose keys are unique across the schema, so a targeted
    line-anchored regex is sufficient and robust against comment lines
    (which begin with `#` and never match `^\\s*<key>:`).
    """
    settings: dict[str, Any] = {}

    hyperfocus = _extract_int(text, "hyperfocus_break_minutes")
    if hyperfocus is not None:
        settings["hyperfocus_break_minutes"] = _clamp(
            hyperfocus, *HYPERFOCUS_BREAK_MIN_RANGE
        )

    threshold = _extract_int(text, "rumination_threshold")
    if threshold is not None:
        settings["rumination_threshold"] = _clamp(
            threshold, *RUMINATION_THRESHOLD_RANGE
        )

    window = _extract_int(text, "rumination_window_minutes")
    if window is not None:
        settings["rumination_window_minutes"] = _clamp(
            window, *RUMINATION_WINDOW_RANGE
        )

    eod = _extract_str(text, "end_of_day_local")
    if eod is not None and re.match(r"^\d{1,2}:\d{2}$", eod):
        settings["end_of_day_local"] = eod

    syco = _extract_str(text, "sycophancy_check")
    if syco in ("off", "warn", "refuse"):
        settings["sycophancy_check"] = syco

    return settings


def _extract_int(text: str, key: str) -> int | None:
    match = re.search(
        rf"^[ \t]*{re.escape(key)}[ \t]*:[ \t]*(\d+)\b",
        text,
        re.MULTILINE,
    )
    return int(match.group(1)) if match else None


def _extract_str(text: str, key: str) -> str | None:
    match = re.search(
        rf"^[ \t]*{re.escape(key)}[ \t]*:[ \t]*[\"']?([^\"'#\r\n]+?)[\"']?[ \t]*(?:#.*)?$",
        text,
        re.MULTILINE,
    )
    return match.group(1).strip() if match else None


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


# ── Payload extraction (best-effort against Claude Code shape) ───────────


def _extract_user_prompt(payload: dict[str, Any]) -> str | None:
    """Pull a user prompt from the hook payload. Claude Code's exact field
    name varies by event — try a handful and stop on first match."""
    for key in ("prompt", "user_prompt", "userPrompt", "input"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    # Tool input shape — used by some hook variants
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        text = tool_input.get("prompt") or tool_input.get("input")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return None


def _extract_assistant_response(payload: dict[str, Any]) -> str | None:
    """Pull an assistant response from PostToolUse payload."""
    for key in ("response", "response_text", "output", "result"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    tool_response = payload.get("tool_response")
    if isinstance(tool_response, dict):
        text = tool_response.get("text") or tool_response.get("output")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return None


# ── State I/O ────────────────────────────────────────────────────────────


def _load_session() -> dict[str, Any]:
    try:
        with SESSION_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_session(state: dict[str, Any]) -> None:
    try:
        with SESSION_FILE.open("w", encoding="utf-8") as fh:
            json.dump(state, fh)
    except Exception as exc:
        _log("session-save-error", {"error": str(exc)})


def _load_prompts() -> list[dict[str, Any]]:
    try:
        with PROMPTS_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _record_prompt(text: str) -> None:
    prompts = _load_prompts()
    prompts.append({"at": _now().isoformat(), "text": text[:2000]})
    if len(prompts) > MAX_PROMPT_HISTORY:
        prompts = prompts[-MAX_PROMPT_HISTORY:]
    try:
        with PROMPTS_FILE.open("w", encoding="utf-8") as fh:
            json.dump(prompts, fh)
    except Exception as exc:
        _log("prompt-save-error", {"error": str(exc)})


def _parse_iso(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.min.replace(tzinfo=UTC)


# ── Output ───────────────────────────────────────────────────────────────


def _emit_banner(message: str) -> None:
    """Queue a banner for the end-of-invocation flush and record it in the
    audit log. Surfacing happens in `_flush_banners` via Claude Code's
    structured `systemMessage` output — NOT stderr, which only shows in
    transcript/verbose mode (the pre-0.0.2 invisibility bug)."""
    _PENDING_BANNERS.append(message)
    _log("banner", {"message": message[:200]})


def _flush_banners() -> None:
    """Emit all queued banners as a single JSON object on stdout, exit 0.

    `systemMessage` is Claude Code's documented non-blocking, user-visible
    hook channel. We deliberately do NOT set any permission decision, so
    the tool call proceeds untouched — the guardrail never blocks work.
    Failures here are swallowed: a guardrail must never break a tool call.
    """
    if not _PENDING_BANNERS:
        return
    try:
        sys.stdout.write(_render_banner_payload(_PENDING_BANNERS))
        sys.stdout.flush()
    except Exception as exc:
        _log("banner-flush-error", {"error": str(exc)})


def _render_banner_payload(banners: list[str]) -> str:
    """Build the JSON string Claude Code reads from stdout. Pure + testable."""
    return json.dumps({"systemMessage": "\n".join(banners)})


def _log(event: str, data: dict[str, Any]) -> None:
    try:
        entry = {
            "at": _now().isoformat(),
            "event": event,
            "version": VERSION,
            **data,
        }
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
    except Exception as exc:
        # Cannot recurse into _log here; write minimally to stderr.
        sys.stderr.write(f"[neurodock-guardrail] log-write-error: {exc}\n")


def _read_stdin_payload() -> dict[str, Any]:
    if sys.stdin.isatty():
        return {}
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


# ── Self-test (run with `python proactive_guardrail.py self-test`) ──────


def _self_test() -> int:
    """Smoke-test each heuristic against a known-trip and known-skip input."""
    ok = True

    # Hyperfocus: 200 min elapsed → hard level (default 90-min ladder)
    fake_state = {
        "started_at": (_now() - timedelta(minutes=200)).isoformat(),
        "tool_count": 5,
    }
    banner = _evaluate_hyperfocus(fake_state)
    if banner is None or "hard" not in banner.lower():
        sys.stderr.write(f"FAIL: hyperfocus hard-level: {banner!r}\n")
        ok = False

    # Hyperfocus: 10 min elapsed → no banner
    fake_state["started_at"] = (_now() - timedelta(minutes=10)).isoformat()
    if _evaluate_hyperfocus(fake_state) is not None:
        sys.stderr.write("FAIL: hyperfocus should not fire at 10 min\n")
        ok = False

    # Profile-driven threshold: a 60-min break setting must fire at 70 min
    # elapsed (which is below the default 90-min gentle threshold of 54…
    # wait: 54<70 so it would fire by default too — use 45 min vs a 30-min
    # setting to prove the profile value, not the default, drives it).
    short_state = {"started_at": (_now() - timedelta(minutes=45)).isoformat()}
    if _evaluate_hyperfocus(short_state, break_minutes=90) is not None:
        sys.stderr.write("FAIL: 45 min should NOT fire on a 90-min break\n")
        ok = False
    if _evaluate_hyperfocus(short_state, break_minutes=30) is None:
        sys.stderr.write("FAIL: 45 min SHOULD fire on a 30-min break\n")
        ok = False

    # Profile parsing: extract scalars from a representative profile snippet.
    sample_profile = (
        "schema_version: \"0.1.0\"\n"
        "chronometric:\n"
        "  # how long before a nudge\n"
        "  hyperfocus_break_minutes: 60\n"
        "  end_of_day_local: \"18:30\"\n"
        "guardrails:\n"
        "  rumination_threshold: 4\n"
        "  rumination_window_minutes: 120\n"
        "  sycophancy_check: \"off\"\n"
    )
    parsed = _parse_profile_text(sample_profile)
    expected = {
        "hyperfocus_break_minutes": 60,
        "end_of_day_local": "18:30",
        "rumination_threshold": 4,
        "rumination_window_minutes": 120,
        "sycophancy_check": "off",
    }
    if parsed != expected:
        sys.stderr.write(f"FAIL: profile parse: got {parsed!r}\n")
        ok = False

    # Profile parsing: out-of-range values are clamped to the valid range.
    clamped = _parse_profile_text("hyperfocus_break_minutes: 9999\n")
    if clamped.get("hyperfocus_break_minutes") != HYPERFOCUS_BREAK_MIN_RANGE[1]:
        sys.stderr.write(f"FAIL: clamp out-of-range: {clamped!r}\n")
        ok = False

    # Profile parsing: an empty / commented profile yields no overrides.
    if _parse_profile_text("# just a comment\nschema_version: \"0.1.0\"\n") != {}:
        sys.stderr.write("FAIL: bare profile should yield no overrides\n")
        ok = False

    # End-of-day: 19:00 with an 18:30 clock-out is "past end of day".
    evening = _now().replace(hour=19, minute=0, second=0, microsecond=0)
    if not _is_past_end_of_day(evening, "18:30"):
        sys.stderr.write("FAIL: 19:00 should be past an 18:30 end-of-day\n")
        ok = False
    midday = _now().replace(hour=12, minute=0, second=0, microsecond=0)
    if _is_past_end_of_day(midday, "18:30"):
        sys.stderr.write("FAIL: 12:00 should NOT be past an 18:30 end-of-day\n")
        ok = False

    # Banner payload: combined banners render as valid JSON with systemMessage.
    payload = _render_banner_payload(["first banner", "second banner"])
    decoded = json.loads(payload)
    if decoded.get("systemMessage") != "first banner\nsecond banner":
        sys.stderr.write(f"FAIL: banner payload shape: {payload!r}\n")
        ok = False

    # Sycophancy: positive case
    sycophancy_text = "Absolutely! You're 100% right about this approach."
    if _evaluate_sycophancy(sycophancy_text * 3) is None:
        sys.stderr.write("FAIL: sycophancy should fire on pure agreement\n")
        ok = False

    # Sycophancy: balanced case
    balanced_text = (
        "Absolutely a valid approach, however the downside is increased "
        "complexity and the trade-off is worth weighing carefully."
    )
    if _evaluate_sycophancy(balanced_text * 2) is not None:
        sys.stderr.write("FAIL: sycophancy should NOT fire on balanced text\n")
        ok = False

    # Jaccard similarity sanity check
    sim = _jaccard_similarity(
        "how do I fix the linkedin image translation",
        "the linkedin image translation is broken how do I fix it",
    )
    if sim < 0.5:
        sys.stderr.write(f"FAIL: jaccard sim too low: {sim}\n")
        ok = False

    if ok:
        sys.stdout.write(f"OK: proactive_guardrail v{VERSION} self-test passed.\n")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
