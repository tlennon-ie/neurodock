#!/usr/bin/env python3
"""NeuroDock proactive-guardrail daemon (Phase 3).

A long-running poller that watches the same state files the Phase 1
Claude Code hook updates (`~/.neurodock/state/guardrail-session.json`
and `~/.neurodock/state/guardrail-prompts.json`), evaluates the same
hyperfocus / rumination heuristics, and surfaces interventions via the
host OS's native notification channel.

Why a separate daemon when the Phase 1 hook already exists:
  - The hook only fires inside Claude Code. It can't catch you working
    in a terminal at 02:00, doomscrolling at 02:30, or back in
    Claude Code at 03:00 with a stale `started_at`.
  - The daemon is host-agnostic: it polls on a wall-clock tick, runs
    the same heuristics, and notifies you whether you're typing in
    your IDE, in chat, or doing nothing at all.

Install (one-time, bundled with `@neurodock/cli`):

    neurodock install-hooks --install-daemon

…which calls into this script's `install` subcommand to set up an
auto-start entry (Windows: HKCU Run key; macOS: LaunchAgent plist;
Linux: ~/.config/systemd/user/neurodock-guardrail.service).

Run manually:

    python ~/.neurodock/hooks/neurodock_daemon.py run
    python ~/.neurodock/hooks/neurodock_daemon.py install
    python ~/.neurodock/hooks/neurodock_daemon.py uninstall
    python ~/.neurodock/hooks/neurodock_daemon.py self-test

Opt-out at any time:

    export NEURODOCK_GUARDRAILS=off       # disables daemon AND hook
    python ~/.neurodock/hooks/neurodock_daemon.py uninstall

Pure stdlib. No pip install. Works on Python 3.11+.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

VERSION = "0.0.1"
STATE_DIR = Path.home() / ".neurodock" / "state"
HOOK_DIR = Path.home() / ".neurodock" / "hooks"
SESSION_FILE = STATE_DIR / "guardrail-session.json"
PROMPTS_FILE = STATE_DIR / "guardrail-prompts.json"
DAEMON_STATE_FILE = STATE_DIR / "daemon.json"
LOG_FILE = STATE_DIR / "daemon-log.jsonl"

# Tick every 5 minutes by default. Tunable via env for testing.
TICK_SECONDS = int(os.environ.get("NEURODOCK_DAEMON_TICK_SECONDS", "300"))

# Dedup window — don't re-fire the same signal within this many seconds.
DEDUP_SECONDS = 30 * 60

# Heuristic thresholds — mirror the Phase 1 hook so the user gets a
# consistent experience whether they're in Claude Code or not.
HYPERFOCUS_BREAK_MINUTES = 90
DEEP_NIGHT_HOURS = range(0, 6)  # 00:00..05:59 local
LATE_NIGHT_HOURS = range(22, 24)  # 22:00..23:59 local


def main() -> int:
    if os.environ.get("NEURODOCK_GUARDRAILS", "").lower() == "off":
        return 0
    if len(sys.argv) < 2:
        sys.stderr.write(_usage())
        return 1
    cmd = sys.argv[1]
    if cmd == "run":
        return _run_forever()
    if cmd == "tick":
        return _run_one_tick()
    if cmd == "install":
        return _install_autostart()
    if cmd == "uninstall":
        return _uninstall_autostart()
    if cmd == "self-test":
        return _self_test()
    sys.stderr.write(_usage())
    return 1


def _usage() -> str:
    return (
        f"NeuroDock proactive-guardrail daemon v{VERSION}\n"
        "  run            poll forever (foreground)\n"
        "  tick           run one evaluation cycle and exit\n"
        "  install        register autostart for the current user\n"
        "  uninstall      remove autostart entry\n"
        "  self-test      smoke-test the heuristics\n"
    )


# ── Run loop ─────────────────────────────────────────────────────────────


def _run_forever() -> int:
    """Block forever, ticking every TICK_SECONDS. Exits silently on SIGINT."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _log("daemon-start", {"tick_seconds": TICK_SECONDS, "version": VERSION})
    try:
        while True:
            _run_one_tick()
            time.sleep(TICK_SECONDS)
    except KeyboardInterrupt:
        _log("daemon-stop", {"reason": "sigint"})
        return 0
    except Exception as exc:  # broad-except: must not crash autostart
        _log("daemon-error", {"error": str(exc)})
        return 1


def _run_one_tick() -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state = _load_daemon_state()
    now = _now()
    signal = _evaluate(now)
    if signal is None:
        return 0
    # Dedup: don't re-fire the same signal kind within DEDUP_SECONDS.
    last = state.get("last_surfaced", {})
    last_kind = last.get("kind")
    last_at = last.get("at")
    if last_kind == signal["kind"] and isinstance(last_at, str):
        try:
            elapsed = (now - datetime.fromisoformat(last_at)).total_seconds()
            if elapsed < DEDUP_SECONDS:
                return 0
        except Exception as exc:
            _log("daemon-dedup-parse-error", {"error": str(exc)})
    _surface(signal)
    state["last_surfaced"] = {
        "kind": signal["kind"],
        "at": now.isoformat(),
    }
    _save_daemon_state(state)
    return 0


# ── Heuristic evaluation ─────────────────────────────────────────────────


def _evaluate(now: datetime) -> dict[str, Any] | None:
    """Return a signal dict, or None when nothing trips this tick."""
    session = _load_session()
    started_iso = session.get("started_at") if isinstance(session, dict) else None

    # Deep-night check first — most universally applicable signal.
    hour = now.hour
    band: str | None = None
    if hour in DEEP_NIGHT_HOURS:
        band = "deep_night"
    elif hour in LATE_NIGHT_HOURS:
        band = "late_night"
    if band:
        return {
            "kind": "clock_band",
            "band": band,
            "hour": hour,
            "title": "NeuroDock — late-night check",
            "message": (
                f"It's {band.replace('_', ' ')} local ({hour:02d}:00). "
                "If you can save and stop, that's the kindest move."
            ),
        }

    # Hyperfocus on an open Claude Code session.
    if isinstance(started_iso, str):
        try:
            started = datetime.fromisoformat(started_iso)
        except ValueError:
            started = None
        if started is not None:
            elapsed_min = (now - started).total_seconds() / 60.0
            if elapsed_min >= HYPERFOCUS_BREAK_MINUTES:
                return {
                    "kind": "hyperfocus",
                    "elapsed_min": int(elapsed_min),
                    "title": "NeuroDock — hyperfocus check",
                    "message": (
                        f"This Claude Code session has been open "
                        f"{int(elapsed_min)} min. Worth a real break — "
                        "walk, hydrate, switch context for 10 min."
                    ),
                }

    return None


# ── Native notification ──────────────────────────────────────────────────


def _surface(signal: dict[str, Any]) -> None:
    title = signal.get("title", "NeuroDock")
    message = signal.get("message", "")
    _log("surface", {"kind": signal.get("kind"), "title": title})
    system = platform.system()
    try:
        if system == "Windows":
            _notify_windows(title, message)
        elif system == "Darwin":
            _notify_macos(title, message)
        else:
            _notify_linux(title, message)
    except Exception as exc:
        _log("notify-error", {"error": str(exc)})


def _notify_windows(title: str, message: str) -> None:
    # Use PowerShell BurntToast-free approach: New-BurntToastNotification
    # isn't always present. Use the built-in toast API via XML through
    # the Windows Runtime instead. Falls back to msg.exe on failure.
    #
    # Security: title and message come from hardcoded daemon logic today,
    # but _escape_ps() defensively strips shell-metacharacters so future
    # callers cannot inject PowerShell via the notification body.
    ps_script = (
        "[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null;"
        "$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent("
        "[Windows.UI.Notifications.ToastTemplateType]::ToastText02);"
        f'$template.GetElementsByTagName("text").Item(0).AppendChild($template.CreateTextNode("{_escape_ps(title)}")) | Out-Null;'
        f'$template.GetElementsByTagName("text").Item(1).AppendChild($template.CreateTextNode("{_escape_ps(message)}")) | Out-Null;'
        '$notify = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("NeuroDock");'
        "$notify.Show([Windows.UI.Notifications.ToastNotification]::new($template));"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
        check=False,
        capture_output=True,
        timeout=10,
    )


def _notify_macos(title: str, message: str) -> None:
    # Security: osascript -e interpolates title/message into the AppleScript
    # source.  _escape_as() strips characters that would break out of the
    # quoted string context inside the AppleScript literal.
    script = f'display notification "{_escape_as(message)}" with title "{_escape_as(title)}"'
    subprocess.run(
        ["osascript", "-e", script],
        check=False,
        capture_output=True,
        timeout=10,
    )


def _notify_linux(title: str, message: str) -> None:
    # Most desktop environments have notify-send. We don't fail loud if
    # it's absent — Linux server users without a display server will
    # see the daemon log entries but no toast.
    # Security: title and message are passed as separate argv elements —
    # no shell interpolation, no escaping required.
    subprocess.run(
        ["notify-send", "-a", "NeuroDock", title, message],
        check=False,
        capture_output=True,
        timeout=10,
    )


# Characters to STRIP from PowerShell double-quoted string interpolation.
# Note: double-quote itself is NOT in this set — it is backslash-escaped
# by _escape_ps() instead of being stripped, so the text node value is
# preserved.  Backtick is the PS escape character, so it must be stripped.
_PS_STRIP = str.maketrans(
    "",
    "",
    "`$(){};&|<>\\\n\r",
)

# Characters to STRIP from AppleScript double-quoted string interpolation.
# AppleScript has no reliable backslash escape for double-quote inside a
# quoted string (the behaviour is interpreter-version-dependent), so both
# double-quote and backslash are stripped rather than escaped.
_AS_STRIP = str.maketrans(
    "",
    "",
    '"\\&|;`\n\r',
)


def _escape_ps(s: str) -> str:
    """Strip PS-dangerous chars; backslash-escape remaining double-quotes.

    The double-quote is backslash-escaped (not stripped) so that the XML
    text node still receives the literal quote character.
    """
    stripped = s.translate(_PS_STRIP)
    return stripped.replace('"', '\\"')


def _escape_as(s: str) -> str:
    """Strip AppleScript-dangerous chars including double-quote.

    AppleScript double-quoted literals cannot reliably escape a quote via
    backslash on all macOS versions, so the double-quote is stripped
    entirely rather than kept.
    """
    return s.translate(_AS_STRIP)


# ── Autostart wiring ─────────────────────────────────────────────────────


def _install_autostart() -> int:
    """Register a per-user autostart entry on the current OS."""
    system = platform.system()
    daemon_script = (HOOK_DIR / "neurodock_daemon.py").resolve()
    if not daemon_script.exists():
        sys.stderr.write(
            f"daemon script not found at {daemon_script} — run `neurodock install-hooks` first.\n"
        )
        return 1
    if system == "Windows":
        return _install_windows_autostart(daemon_script)
    if system == "Darwin":
        return _install_macos_launchagent(daemon_script)
    return _install_linux_systemd_user_unit(daemon_script)


def _uninstall_autostart() -> int:
    system = platform.system()
    if system == "Windows":
        return _uninstall_windows_autostart()
    if system == "Darwin":
        return _uninstall_macos_launchagent()
    return _uninstall_linux_systemd_user_unit()


def _install_windows_autostart(daemon_script: Path) -> int:
    # Register an HKCU Run entry so the daemon launches at user logon.
    # No admin rights required.
    cmd = f'python "{str(daemon_script).replace(chr(92), "/")}" run'
    try:
        subprocess.run(
            [
                "reg",
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "NeuroDockGuardrail",
                "/t",
                "REG_SZ",
                "/d",
                cmd,
                "/f",
            ],
            check=True,
            capture_output=True,
            timeout=10,
        )
        sys.stdout.write("Registered HKCU Run entry. Daemon will launch at next logon.\n")
        return 0
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(f"reg add failed: {exc.stderr.decode(errors='ignore')}\n")
        return 1


def _uninstall_windows_autostart() -> int:
    try:
        subprocess.run(
            [
                "reg",
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "NeuroDockGuardrail",
                "/f",
            ],
            check=True,
            capture_output=True,
            timeout=10,
        )
        return 0
    except subprocess.CalledProcessError:
        # Already absent — fine.
        return 0


def _install_macos_launchagent(daemon_script: Path) -> int:
    agent_dir = Path.home() / "Library" / "LaunchAgents"
    agent_dir.mkdir(parents=True, exist_ok=True)
    plist = agent_dir / "org.neurodock.guardrail.plist"
    contents = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>org.neurodock.guardrail</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>python3</string>
    <string>{daemon_script}</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{LOG_FILE}</string>
  <key>StandardErrorPath</key><string>{LOG_FILE}</string>
</dict>
</plist>
"""
    plist.write_text(contents, encoding="utf-8")
    subprocess.run(["launchctl", "load", str(plist)], check=False, capture_output=True)
    sys.stdout.write(f"Wrote LaunchAgent at {plist}\n")
    return 0


def _uninstall_macos_launchagent() -> int:
    plist = Path.home() / "Library" / "LaunchAgents" / "org.neurodock.guardrail.plist"
    if not plist.exists():
        return 0
    subprocess.run(["launchctl", "unload", str(plist)], check=False, capture_output=True)
    plist.unlink(missing_ok=True)
    return 0


def _install_linux_systemd_user_unit(daemon_script: Path) -> int:
    unit_dir = Path.home() / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit = unit_dir / "neurodock-guardrail.service"
    contents = f"""[Unit]
Description=NeuroDock proactive guardrail daemon

[Service]
ExecStart=/usr/bin/env python3 {daemon_script} run
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
"""
    unit.write_text(contents, encoding="utf-8")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False, capture_output=True)
    subprocess.run(
        ["systemctl", "--user", "enable", "--now", "neurodock-guardrail.service"],
        check=False,
        capture_output=True,
    )
    sys.stdout.write(f"Wrote systemd user unit at {unit}\n")
    return 0


def _uninstall_linux_systemd_user_unit() -> int:
    unit = Path.home() / ".config" / "systemd" / "user" / "neurodock-guardrail.service"
    subprocess.run(
        ["systemctl", "--user", "disable", "--now", "neurodock-guardrail.service"],
        check=False,
        capture_output=True,
    )
    if unit.exists():
        unit.unlink(missing_ok=True)
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False, capture_output=True)
    return 0


# ── State + logging ──────────────────────────────────────────────────────


def _load_session() -> dict[str, Any]:
    try:
        with SESSION_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _load_daemon_state() -> dict[str, Any]:
    try:
        with DAEMON_STATE_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_daemon_state(state: dict[str, Any]) -> None:
    try:
        with DAEMON_STATE_FILE.open("w", encoding="utf-8") as fh:
            json.dump(state, fh)
    except Exception as exc:
        _log("daemon-state-save-error", {"error": str(exc)})


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
        sys.stderr.write(f"[neurodock-daemon] log-write-error: {exc}\n")


def _now() -> datetime:
    return datetime.now(UTC).astimezone()


# ── Self-test ────────────────────────────────────────────────────────────


def _self_test() -> int:
    ok = True
    # Deep-night: synthesize a fake now at 02:00.
    now = _now().replace(hour=2)
    signal = _evaluate(now)
    if signal is None or signal.get("kind") != "clock_band":
        sys.stderr.write(f"FAIL: deep-night should fire at 02:00, got {signal}\n")
        ok = False
    # Hyperfocus: write a fake session 200 min ago, evaluate at midday.
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    fake_start = (now.replace(hour=12) - timedelta(minutes=200)).isoformat()
    SESSION_FILE.write_text(
        json.dumps({"started_at": fake_start, "tool_count": 5}),
        encoding="utf-8",
    )
    midday = _now().replace(hour=12)
    signal = _evaluate(midday)
    if signal is None or signal.get("kind") != "hyperfocus":
        sys.stderr.write(f"FAIL: hyperfocus should fire after 200 min, got {signal}\n")
        ok = False
    # Cleanup
    SESSION_FILE.unlink(missing_ok=True)
    if ok:
        sys.stdout.write(f"OK: neurodock_daemon v{VERSION} self-test passed.\n")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
