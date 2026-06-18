# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Python port of the shared, language-neutral neurotype-addenda assembler.

This is the Python half of ADR 0012: the per-(tool x neurotype) prompt-shaping
content lives once, as a language-neutral JSON artifact in ``@neurodock/core``
(``data/neurotype-addenda/v1.json``). A byte-identical copy ships inside this
package as package-data; :func:`assemble_neurotype_addendum` reproduces the
TypeScript ``assembleNeurotypeAddendum`` exactly (fusion -> priority order ->
per-tool block with generic fallback -> tourette/other specials -> voice-input
cross-cutting block -> conflict footer -> ``{max_chunk_size}`` / ``{notes}``
interpolation -> wrapper).

Vendor-neutrality (ADR 0005): this module only assembles prompt *text*. It
imports no LLM SDK and makes no model call.

Defensiveness: if the bundled artifact is missing or unreadable, the loader logs
``addenda_artifact_unavailable`` and serves a minimal safe-default artifact whose
only behaviour is the "all-default => empty string" gate, so a packaging mishap
degrades to today's un-shaped prompt rather than crashing a tool call.

The cross-language parity test (``tests/test_addenda_parity.py``) and the
divergence guard (``tests/test_artifact_parity.py``) are the authorities that the
Python output equals the TypeScript output and that the bundled artifact has not
drifted from core's source of truth.
"""

from __future__ import annotations

import copy
import json
import logging
from dataclasses import dataclass
from importlib import resources
from typing import Any

_LOG = logging.getLogger("neurodock_mcp_translation.addenda")

# Relative resource path within ``neurodock_mcp_translation`` (a copy of core's
# ``data/neurotype-addenda/v1.json``, kept byte-identical by the divergence guard).
ARTIFACT_RESOURCE = "neurotype-addenda/v1.json"
# Derived from this module's own package so a package rename can't silently break
# artifact loading: ``neurodock_mcp_translation.addenda`` -> ``...mcp_translation.data``.
_ARTIFACT_SUBPACKAGE = f"{__name__.rsplit('.', 1)[0]}.data"

# A minimal artifact used only when the bundled file is missing/unreadable. It
# carries no content blocks, so every neurotype renders nothing; with no header
# either, the assembler's gate returns "" for the all-default case and the
# wrapper for any non-default knob — never a crash, never fabricated content.
_SAFE_DEFAULT_ARTIFACT: dict[str, Any] = {
    "artifact_version": "0.0.0-safe-default",
    "fusion": {"result": "audhd", "all_of": ["adhd", "asd"], "remove": ["adhd", "asd"]},
    "priority": [],
    "framing": {
        "wrapper_prefix": "",
        "wrapper_suffix": "",
        "section_separator": "\n",
        "block_line_separator": "\n",
        "header": [],
        "footer": [],
        "conflict_footer_min_neurotypes": 3,
        "conflict_footer": "",
    },
    "output_format": {
        "prefix": "Output shape: ",
        "separator": " — ",
        "descriptions": {},
        "default": "answer_first",
    },
    "voice_input": {"block": [""]},
    "tourette": {"block": [""]},
    "other": {"block": ["{notes}"]},
    "generic": {},
    "tools": {},
}


def load_artifact_text() -> str:
    """Return the raw text of the bundled artifact.

    Raises the underlying I/O error; callers that want the safe default go
    through :func:`load_artifact`.
    """

    return (
        resources.files(_ARTIFACT_SUBPACKAGE)
        .joinpath(ARTIFACT_RESOURCE)
        .read_text(encoding="utf-8")
    )


def load_artifact() -> dict[str, Any]:
    """Load and parse the bundled neurotype-addenda artifact.

    On any failure (missing file, unreadable, malformed JSON, wrong top-level
    type) logs ``addenda_artifact_unavailable`` and returns the safe-default
    artifact, so a packaging mishap degrades to an un-shaped prompt rather than
    crashing.
    """

    try:
        data = json.loads(load_artifact_text())
    except (OSError, FileNotFoundError, ValueError, ModuleNotFoundError) as exc:
        _LOG.warning(
            "addenda_artifact_unavailable",
            extra={
                "event": "addenda_artifact_unavailable",
                "error_type": type(exc).__name__,
            },
        )
        # Deep-copy so a caller can never mutate the shared nested dicts of the
        # module-level template (a shallow ``dict(...)`` would alias them).
        return copy.deepcopy(_SAFE_DEFAULT_ARTIFACT)
    if not isinstance(data, dict):
        _LOG.warning(
            "addenda_artifact_unavailable",
            extra={"event": "addenda_artifact_unavailable", "error_type": "NotAMapping"},
        )
        return copy.deepcopy(_SAFE_DEFAULT_ARTIFACT)
    return data


# Import-time existence check: surface a missing artifact at module import, never
# silently. The result is cached and reused by the tools.
_ARTIFACT: dict[str, Any] = load_artifact()


def default_artifact() -> dict[str, Any]:
    """Return the import-time-cached artifact (or the safe default on failure)."""

    return _ARTIFACT


@dataclass(frozen=True)
class AssembleOptions:
    """Inputs to :func:`assemble_neurotype_addendum` (mirrors the TS options).

    ``tool`` is the tool being shaped; when ``None`` every neurotype falls back
    to its generic block. ``output_format`` defaults to the artifact's declared
    default when ``None``.
    """

    neurotypes: list[str]
    max_chunk_size: int
    tool: str | None = None
    output_format: str | None = None
    voice_input_preferred: bool | None = None
    additional_notes: str | None = None


def _framing(artifact: dict[str, Any]) -> dict[str, Any]:
    framing = artifact.get("framing")
    return framing if isinstance(framing, dict) else {}


def _str(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _block_lines(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [line for line in value if isinstance(line, str)]


def _effective_neurotypes(artifact: dict[str, Any], input_types: list[str]) -> list[str]:
    """Apply the fusion (AuDHD substitution) rule; preserve set-union order.

    Mirrors the TS ``effectiveNeurotypes`` / ``Set`` semantics: insertion order
    is first-seen order, the fusion ``result`` is appended at the end if newly
    added, and ``remove`` members are dropped. Python ``dict`` preserves
    insertion order, matching JS ``Set``.
    """

    fusion = artifact.get("fusion")
    fusion = fusion if isinstance(fusion, dict) else {}
    result = _str(fusion.get("result"))
    all_of = fusion.get("all_of")
    all_of = [n for n in all_of if isinstance(n, str)] if isinstance(all_of, list) else []
    remove = fusion.get("remove")
    remove = [n for n in remove if isinstance(n, str)] if isinstance(remove, list) else []

    # Ordered set via dict keys (matches JS Set insertion-order iteration).
    ordered: dict[str, None] = {}
    for n in input_types:
        ordered.setdefault(n, None)

    has_result = result in ordered if result else False
    has_all = bool(all_of) and all(n in ordered for n in all_of)
    if has_result or has_all:
        if result:
            ordered.setdefault(result, None)
        for n in remove:
            ordered.pop(n, None)
    return list(ordered.keys())


def _order_by_priority(artifact: dict[str, Any], neurotypes: list[str]) -> list[str]:
    """Sort by the artifact's priority ordering (recency: higher index = later).

    Mirrors the TS ``orderByPriority``: ``priority.indexOf(x)`` returns ``-1``
    for an unlisted neurotype, which sorts it first. Python's ``list.sort`` is
    stable, matching ``Array.prototype.sort`` for equal keys.
    """

    priority = artifact.get("priority")
    priority = [p for p in priority if isinstance(p, str)] if isinstance(priority, list) else []

    def index_of(value: str) -> int:
        try:
            return priority.index(value)
        except ValueError:
            return -1

    return sorted(neurotypes, key=index_of)


def _interpolate_max_chunk_size(line: str, max_chunk_size: int) -> str:
    return line.replace("{max_chunk_size}", str(max_chunk_size))


def _render_output_format_block(artifact: dict[str, Any], fmt: str) -> str:
    output_format = artifact.get("output_format")
    output_format = output_format if isinstance(output_format, dict) else {}
    descriptions = output_format.get("descriptions")
    descriptions = descriptions if isinstance(descriptions, dict) else {}
    description = _str(descriptions.get(fmt))
    prefix = _str(output_format.get("prefix"))
    separator = _str(output_format.get("separator"))
    return prefix + fmt + separator + description


def _render_other_block(artifact: dict[str, Any], notes: str) -> str:
    other = artifact.get("other")
    other = other if isinstance(other, dict) else {}
    sep = _str(_framing(artifact).get("block_line_separator"), "\n")
    lines = _block_lines(other.get("block"))
    return sep.join(line.replace("{notes}", notes) for line in lines)


def _render_neurotype_block(
    artifact: dict[str, Any],
    neurotype: str,
    max_chunk_size: int,
    additional_notes: str | None,
    tool: str | None,
) -> str:
    """Render a single neurotype's block (mirrors the TS ``renderNeurotypeBlock``)."""

    sep = _str(_framing(artifact).get("block_line_separator"), "\n")

    if neurotype == "tourette":
        tourette = artifact.get("tourette")
        tourette = tourette if isinstance(tourette, dict) else {}
        return sep.join(_block_lines(tourette.get("block")))

    if neurotype == "other":
        if additional_notes is None or len(additional_notes) == 0:
            return ""
        return _render_other_block(artifact, additional_notes)

    block: list[str] | None = None
    if tool is not None:
        tools = artifact.get("tools")
        matrix = tools.get(tool) if isinstance(tools, dict) else None
        if isinstance(matrix, dict):
            candidate = matrix.get(neurotype)
            if isinstance(candidate, list):
                block = _block_lines(candidate)
    if block is None:
        generic = artifact.get("generic")
        candidate = generic.get(neurotype) if isinstance(generic, dict) else None
        if isinstance(candidate, list):
            block = _block_lines(candidate)
    if block is None:
        return ""
    return sep.join(_interpolate_max_chunk_size(line, max_chunk_size) for line in block)


def assemble_neurotype_addendum(artifact: dict[str, Any], options: AssembleOptions) -> str:
    """Assemble the per-neurotype prompt addendum from the artifact.

    Pure function: deterministic, no I/O, no mutation of inputs. A direct port of
    the TypeScript ``assembleNeurotypeAddendum`` (proven byte-identical by
    ``tests/test_addenda_parity.py``).

    Returns ``""`` when there are no effective neurotypes, no notes, a default
    output format, AND no voice-input hint — so the all-default case stays
    byte-identical to an un-shaped prompt.
    """

    framing = _framing(artifact)
    output_format = artifact.get("output_format")
    output_format = output_format if isinstance(output_format, dict) else {}
    default_format = _str(output_format.get("default"), "answer_first")
    fmt = options.output_format if options.output_format is not None else default_format

    effective = _effective_neurotypes(artifact, list(options.neurotypes))
    additional_notes = options.additional_notes
    has_notes = additional_notes is not None and len(additional_notes) > 0
    has_non_default_format = fmt != default_format
    wants_voice_input = options.voice_input_preferred is True

    if (
        len(effective) == 0
        and not has_notes
        and not has_non_default_format
        and not wants_voice_input
    ):
        return ""

    # The TS source joins SECTIONS with framing.section_separator and joins the
    # lines WITHIN a block with framing.block_line_separator; keep that split.
    section_sep = _str(framing.get("section_separator"), "\n")

    sections: list[str] = []
    for line in _block_lines(framing.get("header")):
        sections.append(line)
    sections.append(_render_output_format_block(artifact, fmt))

    if wants_voice_input:
        voice = artifact.get("voice_input")
        voice = voice if isinstance(voice, dict) else {}
        sep = _str(framing.get("block_line_separator"), "\n")
        sections.append("")
        sections.append(sep.join(_block_lines(voice.get("block"))))

    ordered = _order_by_priority(artifact, effective)
    for neurotype in ordered:
        block = _render_neurotype_block(
            artifact,
            neurotype,
            options.max_chunk_size,
            additional_notes,
            options.tool,
        )
        if len(block) > 0:
            sections.append("")
            sections.append(block)

    if has_notes and "other" not in ordered:
        sections.append("")
        sections.append(_render_other_block(artifact, additional_notes or ""))

    min_conflict = framing.get("conflict_footer_min_neurotypes")
    min_conflict = min_conflict if isinstance(min_conflict, int) else 3
    if len(ordered) >= min_conflict:
        sections.append("")
        sections.append(_str(framing.get("conflict_footer")))

    for line in _block_lines(framing.get("footer")):
        sections.append(line)

    wrapper_prefix = _str(framing.get("wrapper_prefix"))
    wrapper_suffix = _str(framing.get("wrapper_suffix"))
    return wrapper_prefix + section_sep.join(sections) + wrapper_suffix


# Cross-cutting helpers reused by the tools ----------------------------------

# Default per-list item cap when neither reader_context nor the profile sets one.
# Matches the canonical NeuroDock profile default (preferences.max_chunk_size).
DEFAULT_MAX_CHUNK_SIZE = 7


__all__ = [
    "ARTIFACT_RESOURCE",
    "DEFAULT_MAX_CHUNK_SIZE",
    "AssembleOptions",
    "assemble_neurotype_addendum",
    "default_artifact",
    "load_artifact",
    "load_artifact_text",
]
