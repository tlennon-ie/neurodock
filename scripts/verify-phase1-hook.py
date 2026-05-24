#!/usr/bin/env python3
"""End-to-end verification of the Phase 1 Python proactive guardrail hook.

Drives `proactive_guardrail.py pre-tool` via subprocess for three
scenarios, asserts that the right banner appears (or is absent) on
stderr, and restores any pre-existing state file at the end. Read-only
with respect to production code — only `~/.neurodock/state/` is
mutated, and it's restored on exit.

Run:
    python scripts/verify-phase1-hook.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
HOOK_PATH = (
    REPO_ROOT
    / "packages"
    / "cli"
    / "src"
    / "assets"
    / "hooks"
    / "proactive_guardrail.py"
)
STATE_DIR = Path.home() / ".neurodock" / "state"
SESSION_FILE = STATE_DIR / "guardrail-session.json"
PROMPTS_FILE = STATE_DIR / "guardrail-prompts.json"
PRETOOL_CHECK_EVERY_N = 5


@dataclass
class ScenarioResult:
    name: str
    passed: bool
    expected: str
    observed: str
    detail: str = ""


def _backup(path: Path) -> Optional[bytes]:
    if not path.exists():
        return None
    return path.read_bytes()


def _restore(path: Path, original: Optional[bytes]) -> None:
    if original is None:
        if path.exists():
            path.unlink()
    else:
        path.write_bytes(original)


def _seed_session(started_minutes_ago: int, tool_count_pre: int) -> None:
    """Write a guardrail-session.json so that the next pre-tool tick
    pushes tool_count to a multiple of PRETOOL_CHECK_EVERY_N."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    started_at = (
        datetime.now(timezone.utc).astimezone()
        - timedelta(minutes=started_minutes_ago)
    ).isoformat()
    payload = {"started_at": started_at, "tool_count": tool_count_pre}
    SESSION_FILE.write_text(json.dumps(payload), encoding="utf-8")


def _run_pretool(prompt: str) -> tuple[int, str, str]:
    proc = subprocess.run(
        [sys.executable, str(HOOK_PATH), "pre-tool"],
        input=json.dumps({"user_prompt": prompt}),
        capture_output=True,
        text=True,
        timeout=15,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout, proc.stderr


def _run_scenario(
    name: str,
    started_minutes_ago: int,
    expect_substr: Optional[str],
    forbid_substr: Optional[str] = None,
) -> ScenarioResult:
    # tool_count_pre = PRETOOL_CHECK_EVERY_N - 1, so after the hook's +1
    # the new tool_count is exactly PRETOOL_CHECK_EVERY_N (a multiple
    # of N => heuristics evaluate).
    _seed_session(started_minutes_ago, PRETOOL_CHECK_EVERY_N - 1)
    rc, _stdout, stderr = _run_pretool(f"verify-phase1 scenario {name}")
    if rc != 0:
        return ScenarioResult(
            name=name,
            passed=False,
            expected=expect_substr or "no banner",
            observed=f"hook exited {rc}",
            detail=f"stderr:\n{stderr}",
        )
    if expect_substr is None:
        passed = "NeuroDock" not in stderr
        return ScenarioResult(
            name=name,
            passed=passed,
            expected="no banner (no 'NeuroDock' on stderr)",
            observed=stderr.strip() or "<empty stderr>",
        )
    passed = expect_substr.lower() in stderr.lower()
    if forbid_substr is not None and forbid_substr.lower() in stderr.lower():
        passed = False
    return ScenarioResult(
        name=name,
        passed=passed,
        expected=f"banner containing {expect_substr!r}",
        observed=stderr.strip() or "<empty stderr>",
    )


def main() -> int:
    if not HOOK_PATH.exists():
        sys.stderr.write(f"FAIL: hook not found at {HOOK_PATH}\n")
        return 2

    # Back up any pre-existing state so we can restore it cleanly.
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    session_backup = _backup(SESSION_FILE)
    prompts_backup = _backup(PROMPTS_FILE)
    # Clear the prompts file so the rumination heuristic stays silent
    # during scenario A and B (rumination is not what we're testing here).
    if PROMPTS_FILE.exists():
        PROMPTS_FILE.unlink()

    results: list[ScenarioResult] = []
    try:
        results.append(
            _run_scenario(
                name="A (5 min elapsed -> no banner)",
                started_minutes_ago=5,
                expect_substr=None,
            )
        )
        results.append(
            _run_scenario(
                name="B (100 min elapsed -> 'real break' nudge)",
                started_minutes_ago=100,
                expect_substr="real break",
            )
        )
        results.append(
            _run_scenario(
                name="C (200 min elapsed -> 'hard threshold')",
                started_minutes_ago=200,
                expect_substr="hard threshold",
            )
        )
    finally:
        _restore(SESSION_FILE, session_backup)
        _restore(PROMPTS_FILE, prompts_backup)

    def _safe(s: str) -> str:
        return s.encode("ascii", "replace").decode("ascii")

    print("\n=== Phase 1 (Python hook) verification ===\n")
    all_passed = True
    for r in results:
        marker = "PASS" if r.passed else "FAIL"
        if not r.passed:
            all_passed = False
        print(f"[{marker}] {r.name}")
        print(f"       expected: {_safe(r.expected)}")
        print(f"       observed: {_safe(r.observed)}")
        if r.detail:
            print(f"       detail:   {_safe(r.detail)}")
        print()
    print(
        f"Summary: {sum(1 for r in results if r.passed)}/{len(results)} passed"
    )
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
