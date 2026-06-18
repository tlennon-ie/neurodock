# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Resolve reader preferences and assemble the per-neurotype prompt addendum.

This is the single seam (ADR 0012) that every tool calls after it renders its
base prompt. It resolves the shaping inputs with field-by-field precedence —
``reader_context`` per field, else the ``profile.yaml`` read, else neutral
absence — assembles the addendum via the pure :func:`assemble_neurotype_addendum`
port, and appends it to the existing prompt content AFTER the schema block (the
extension's recency ordering).

When neither ``reader_context`` nor the profile contributes anything that would
shape the prompt, the assembler returns ``""`` and the content is byte-identical
to today's un-shaped prompt.

Vendor-neutrality (ADR 0005): pure string assembly. No LLM SDK, no model call.
"""

from __future__ import annotations

from dataclasses import replace

from neurodock_mcp_translation.addenda import (
    DEFAULT_MAX_CHUNK_SIZE,
    AssembleOptions,
    assemble_neurotype_addendum,
    default_artifact,
)
from neurodock_mcp_translation.profile import TranslationProfile, load_profile
from neurodock_mcp_translation.types import ReaderContext


def _resolve(
    reader_context: ReaderContext | None,
    profile: TranslationProfile,
) -> AssembleOptions | None:
    """Merge ``reader_context`` over the profile, field-by-field.

    Returns ``None`` when neither source supplies any shaping signal, so the
    caller can skip assembly entirely and keep the prompt byte-identical.
    """

    ctx_neurotypes = reader_context.neurotypes if reader_context is not None else None
    neurotypes = ctx_neurotypes if ctx_neurotypes is not None else profile.neurotypes

    ctx_format = reader_context.output_format if reader_context is not None else None
    output_format = ctx_format if ctx_format is not None else profile.output_format

    ctx_chunk = reader_context.max_chunk_size if reader_context is not None else None
    max_chunk_size = ctx_chunk if ctx_chunk is not None else profile.max_chunk_size

    ctx_voice = reader_context.voice_input_preferred if reader_context is not None else None
    voice = ctx_voice if ctx_voice is not None else profile.voice_input_preferred

    ctx_notes = reader_context.additional_notes if reader_context is not None else None
    notes = ctx_notes if ctx_notes is not None else profile.additional_notes

    # No shaping signal at all -> let the caller short-circuit. An explicit
    # voice-input opt-out (``False``) emits no instruction (the assembler gates
    # on ``is True``), so it is NOT a signal — only ``True`` is.
    has_signal = (
        bool(neurotypes)
        or output_format is not None
        or voice is True
        or (notes is not None and len(notes) > 0)
    )
    if not has_signal:
        return None

    return AssembleOptions(
        neurotypes=list(neurotypes),
        max_chunk_size=(max_chunk_size if max_chunk_size is not None else DEFAULT_MAX_CHUNK_SIZE),
        output_format=output_format,
        voice_input_preferred=voice,
        additional_notes=notes,
    )


def build_addendum(tool: str, reader_context: ReaderContext | None) -> str:
    """Assemble the per-neurotype addendum for ``tool``.

    Resolves ``reader_context`` over the ``profile.yaml`` fallback, then runs the
    pure assembler. Returns ``""`` when nothing shapes the prompt (the
    byte-identical baseline case).
    """

    profile = load_profile()
    options = _resolve(reader_context, profile)
    if options is None:
        return ""
    # ``replace`` carries every existing field forward, so a future
    # AssembleOptions field can never be silently dropped here.
    shaped = replace(options, tool=tool)
    return assemble_neurotype_addendum(default_artifact(), shaped)


def apply_shaping(content: str, tool: str, reader_context: ReaderContext | None) -> str:
    """Append the assembled addendum to ``content`` AFTER the schema block.

    Matches the extension's recency ordering: the schema is concrete and small
    models anchor on it, so the per-neurotype overrides are placed last to be the
    final instruction the model reads. When the addendum is ``""`` (nothing to
    shape), ``content`` is returned unchanged — byte-identical to today.
    """

    return content + build_addendum(tool, reader_context)
