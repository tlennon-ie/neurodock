"""Tests for the M5 notification-text escape functions in neurodock_daemon.py.

Security regression test: verify that shell-injection characters in title/
message strings are stripped before interpolation into PowerShell and
AppleScript command strings.  All of these characters would allow code
execution if they reached the script interpreter unescaped.

Collected under packages/ so the workspace-level pytest run picks them up.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Import the daemon module from its asset path without installing it.
# ---------------------------------------------------------------------------

_DAEMON_PATH = Path(__file__).parent / "neurodock_daemon.py"

_spec = importlib.util.spec_from_file_location("neurodock_daemon", _DAEMON_PATH)
assert _spec is not None and _spec.loader is not None
_mod = importlib.util.module_from_spec(_spec)
sys.modules["neurodock_daemon"] = _mod
_spec.loader.exec_module(_mod)  # type: ignore[union-attr]

_escape_ps = _mod._escape_ps  # type: ignore[attr-defined]
_escape_as = _mod._escape_as  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# PowerShell escape tests
# ---------------------------------------------------------------------------

# PS strips backtick, $, (, ), {, }, ;, &, |, <, >, \, newlines.
# Double-quote is backslash-escaped (NOT stripped) so the XML text node
# value is preserved.
_PS_STRIPPED_CHARS = "`$(){};&|<>\\\n\r"


def test_escape_ps_strips_powershell_injection_chars() -> None:
    """Listed PS-injection chars must be absent from the output."""
    payload = _PS_STRIPPED_CHARS + "hello"
    result = _escape_ps(payload)
    for ch in _PS_STRIPPED_CHARS:
        assert ch not in result, f"char {ch!r} survived _escape_ps"


def test_escape_ps_double_quote_is_escaped_not_stripped() -> None:
    """Double-quotes are backslash-escaped so the text node value is literal."""
    result = _escape_ps('say "hello"')
    # The escaped form must be present.
    assert '\\"' in result
    # And no bare (unescaped) double-quote must remain.
    assert '"' not in result.replace('\\"', "")


def test_escape_ps_newlines_removed() -> None:
    result = _escape_ps("line1\nline2\r\nline3")
    assert "\n" not in result
    assert "\r" not in result


def test_escape_ps_safe_text_passes_through() -> None:
    safe = "NeuroDock — hyperfocus check: 90 min elapsed"
    result = _escape_ps(safe)
    # Em dash and alphanumerics survive unchanged.
    assert "NeuroDock" in result
    assert "90 min" in result


# ---------------------------------------------------------------------------
# AppleScript escape tests
# ---------------------------------------------------------------------------

# AS strips double-quote, backslash, &, |, ;, backtick, and newlines.
# (AppleScript has no reliable backslash-quote escape, so " is stripped.)
_AS_STRIPPED_CHARS = '"\\&|;`\n\r'


def test_escape_as_strips_all_dangerous_chars() -> None:
    """All listed AS-injection chars must be absent from the output."""
    payload = _AS_STRIPPED_CHARS + "hello"
    result = _escape_as(payload)
    for ch in _AS_STRIPPED_CHARS:
        assert ch not in result, f"char {ch!r} survived _escape_as"


def test_escape_as_double_quote_is_stripped() -> None:
    """AppleScript cannot reliably escape " inside a double-quoted literal —
    the function strips it entirely so the resulting string is injection-safe."""
    result = _escape_as('title "check"')
    assert '"' not in result
    # The safe surrounding text is preserved.
    assert "title" in result
    assert "check" in result


def test_escape_as_newlines_removed() -> None:
    result = _escape_as("line1\nline2\r\nline3")
    assert "\n" not in result
    assert "\r" not in result


def test_escape_as_safe_text_passes_through() -> None:
    safe = "NeuroDock — it is late night local (22:00). Save and stop."
    result = _escape_as(safe)
    assert "NeuroDock" in result
    assert "22:00" in result
