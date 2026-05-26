# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""NeuroDock translation MCP server.

v0.0.1 — deterministic-baseline implementation of the four translation tools
specified in `plan.md` Section 7 and ADR 0005:

- ``translate_incoming``  — decode subtext, ambiguity, recommended next action.
- ``check_tone``          — score directness / warmth / urgency axes.
- ``rewrite_outgoing``    — produce a baseline rewrite toward a target register.
- ``brief_meeting``       — partition a transcript into the four-section brief.

Per ADR 0005 §1 ("no LLM SDK inside the server"), this server does NOT import
any vendor SDK (anthropic, openai, ollama, ...). Each tool returns a structured
envelope of the shape::

    {
      "deterministic_analysis": <v0.1.0 output shape, populated heuristically>,
      "prompt_for_llm_refinement": {"role": "user", "content": "...", "output_schema_ref": "..."},
      "eval_corpus_slice": "..."
    }

The caller's MCP client (Claude / Claude Desktop / Claude Code / Ollama host)
MAY ignore the prompt and use the deterministic analysis alone, or invoke its
own LLM with the supplied prompt and replace the deterministic_analysis with
the refined result. The server itself is provider-agnostic and local-first.
"""

from neurodock_mcp_translation.server import build_server

__version__ = "0.0.2"

__all__ = [
    "__version__",
    "build_server",
]
