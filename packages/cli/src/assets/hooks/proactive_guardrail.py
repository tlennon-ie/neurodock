#!/usr/bin/env python3
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

VERSION = "0.0.1"
STATE_DIR = Path.home() / ".neurodock" / "state"
LOG_FILE = STATE_DIR / "guardrail-log.jsonl"
SESSION_FILE = STATE_DIR / "guardrail-session.json"
PROMPTS_FILE = STATE_DIR / "guardrail-prompts.json"

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
    payload = _read_stdin_payload()
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        return 0  # filesystem unavailable — fail silent
    try:
        if kind == "session-start":
            _on_session_start(payload)
        elif kind == "pre-tool":
            _on_pre_tool(payload)
        elif kind == "post-tool":
            _on_post_tool(payload)
        elif kind == "stop":
            _on_stop(payload)
        elif kind == "self-test":
            return _self_test()
    except Exception as exc:
        _log("error", {"kind": kind, "error": str(exc)})
    return 0


# ── Hook handlers ────────────────────────────────────────────────────────


def _on_session_start(_payload: dict[str, Any]) -> None:
    now = _now()
    state = _load_session()
    state["started_at"] = now.isoformat()
    state["tool_count"] = 0
    _save_session(state)
    band = _clock_band(now)
    if band in ("deep_night", "late_night"):
        _emit_banner(
            f"NeuroDock: it's {band.replace('_', ' ')} local time. "
            f"I'll nudge you toward stopping every "
            f"{HYPERFOCUS_BREAK_MINUTES_DEFAULT} minutes."
        )
    _log("session-start", {"band": band})


def _on_pre_tool(payload: dict[str, Any]) -> None:
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

    hyperfocus_banner = _evaluate_hyperfocus(state)
    if hyperfocus_banner:
        _emit_banner(hyperfocus_banner)
    rumination_banner = _evaluate_rumination()
    if rumination_banner:
        _emit_banner(rumination_banner)


def _on_post_tool(payload: dict[str, Any]) -> None:
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


def _evaluate_hyperfocus(state: dict[str, Any]) -> str | None:
    """Elapsed-threshold heuristic; mirrors mcp-guardrail's structure."""
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

    gentle = HYPERFOCUS_BREAK_MINUTES_DEFAULT * HYPERFOCUS_GENTLE_RATIO
    nudge = HYPERFOCUS_BREAK_MINUTES_DEFAULT * HYPERFOCUS_NUDGE_RATIO
    hard = HYPERFOCUS_BREAK_MINUTES_DEFAULT * HYPERFOCUS_HARD_RATIO

    band = _clock_band(now)
    past_eod = band in ("late_night", "deep_night")

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


def _evaluate_rumination() -> str | None:
    """Jaccard-similarity rumination detector across recent prompts."""
    prompts = _load_prompts()
    if len(prompts) < RUMINATION_THRESHOLD_DEFAULT:
        return None
    window_start = _now() - timedelta(minutes=RUMINATION_WINDOW_MINUTES_DEFAULT)
    recent = [p for p in prompts if _parse_iso(p.get("at", "")) >= window_start]
    if len(recent) < RUMINATION_THRESHOLD_DEFAULT:
        return None
    # Compare the latest prompt to the others.
    latest = recent[-1]["text"]
    matches = 0
    for prior in recent[:-1]:
        sim = _jaccard_similarity(latest, prior["text"])
        if sim >= RUMINATION_SIMILARITY_DEFAULT:
            matches += 1
    if matches < RUMINATION_THRESHOLD_DEFAULT - 1:
        return None
    return (
        f"NeuroDock rumination check: you've asked a variant of this question "
        f"{matches + 1} times in the last {RUMINATION_WINDOW_MINUTES_DEFAULT} "
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
    line = f"\n┌─ NeuroDock ──\n│ {message}\n└──\n"
    sys.stderr.write(line)
    sys.stderr.flush()
    _log("banner", {"message": message[:200]})


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

    # Hyperfocus: 200 min elapsed → hard level
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
