# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Prompt-template assets for the translation server.

Templates are stored as ``.prompt.md`` files alongside this module and loaded
via :func:`load_prompt`. Templates use ``{placeholder}`` markers; rendering is
done with :meth:`str.format_map` against a SafeDict so unknown placeholders are
left as-is rather than raising.
"""

from __future__ import annotations

from importlib import resources
from typing import Any


class _SafeDict(dict[str, Any]):
    """Dict subclass that returns ``{key}`` for missing keys.

    This makes :meth:`str.format_map` non-throwing for placeholders that the
    caller chose not to fill in (e.g. an absent ``channel`` hint).
    """

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def load_prompt(name: str) -> str:
    """Return the verbatim contents of ``<name>.prompt.md``.

    ``name`` is the bare tool name (``translate_incoming``, ``check_tone``, ...).
    """

    filename = f"{name}.prompt.md"
    return resources.files(__package__).joinpath(filename).read_text(encoding="utf-8")


def render_prompt(name: str, **values: Any) -> str:
    """Load ``<name>.prompt.md`` and substitute ``{key}`` markers with ``values``.

    Unknown markers are preserved verbatim rather than raising — a defensive
    choice so that prompt-template drift never explodes a tool call.
    """

    template = load_prompt(name)
    return template.format_map(_SafeDict(values))
