# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Skill-style MCP prompts for the hosted server (ADR 0010, Phase A).

MCP carries tools, resources, and *prompts* — not Claude-Code skills. So the ND
skills that map onto the stateless tool surface are surfaced here as MCP
**prompts**: reusable, ND-aware entry points a connected client shows (e.g. as
slash commands). Each one seeds a turn that guides the model to call the matching
hosted tool with the user's input.

These are stateless and carry no personal data — they are safe on the shared
remote endpoint. Prompts for the stateful skills (record-fact, chronometric)
deliberately do NOT live here; they belong to the local/opt-in surface (ADR
0008/0009/0010).

The voice mirrors the skills (`.claude/skills/`): lead with the action, label
subtext as a hypothesis, quote ambiguous spans verbatim, and never act without
the user's confirmation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastmcp import FastMCP

# Pinned by tests: the prompt surface mirrors the stateless skills exactly.
REMOTE_PROMPT_NAMES = frozenset(
    {
        "translate-incoming",
        "check-tone",
        "rewrite-outgoing",
        "brief-meeting",
        "decompose-task",
        "check-rumination",
    }
)


def register_prompts(mcp: FastMCP[Any]) -> None:
    """Register the stateless skill-style prompts on the combined server."""

    @mcp.prompt(
        name="translate-incoming",
        description="Decode the subtext, the real ask, and ambiguous phrases in an incoming message.",
    )
    def translate_incoming_prompt(message: str, channel: str = "generic") -> str:
        return (
            f"Use the translate_incoming tool on this {channel} message, then tell me: the "
            "explicit ask in plain words; the most likely subtext (label it as a hypothesis, "
            "not a fact); and any ambiguous phrases quoted verbatim. Finish with one recommended "
            "next action — but do not take it without my confirmation.\n\n"
            f"Message:\n{message}"
        )

    @mcp.prompt(
        name="check-tone",
        description="Score an outgoing draft on directness / warmth / urgency before I send it.",
    )
    def check_tone_prompt(draft: str, target_register: str = "") -> str:
        target = f" against a '{target_register}' register" if target_register else ""
        return (
            f"Use the check_tone tool on this draft{target}, then show me the directness, warmth, "
            "and urgency scores and flag any phrases that read more harshly or more softly than I "
            "probably intend. Do not rewrite it yet — just the read.\n\n"
            f"Draft:\n{draft}"
        )

    @mcp.prompt(
        name="rewrite-outgoing",
        description="Rewrite an outgoing message toward a target register, preserving technical terms.",
    )
    def rewrite_outgoing_prompt(draft: str, target_register: str) -> str:
        return (
            f"Use the rewrite_outgoing tool to rewrite this message toward a '{target_register}' "
            "register, preserving any technical terms exactly. Show me the rewrite and what "
            "changed; keep my meaning intact.\n\n"
            f"Draft:\n{draft}"
        )

    @mcp.prompt(
        name="brief-meeting",
        description="Turn a meeting transcript into my asks, others' asks, decisions, and ambiguities.",
    )
    def brief_meeting_prompt(transcript: str, me: str) -> str:
        return (
            f"Use the brief_meeting tool on this transcript (I am '{me}'). Give me four sections: "
            "my asks, others' asks, decisions, and ambiguous items. Quote each ambiguous item "
            "verbatim from the transcript — do not paraphrase the anchor.\n\n"
            f"Transcript:\n{transcript}"
        )

    @mcp.prompt(
        name="decompose-task",
        description="Break a vague goal into atomic 5-90 minute tasks I can start now.",
    )
    def decompose_task_prompt(goal: str, time_budget: str = "") -> str:
        budget = f" Fit it within {time_budget} (ISO-8601 duration)." if time_budget else ""
        return (
            f"Use the decompose tool to break this goal into atomic 5-90 minute tasks, each with "
            f"acceptance criteria I can check.{budget} Lead with task 1 — 'start here' — and keep "
            "the rationale for a follow-up, not up front.\n\n"
            f"Goal:\n{goal}"
        )

    @mcp.prompt(
        name="check-rumination",
        description="Check whether I'm going in circles on something, instead of generating new analysis.",
    )
    def check_rumination_prompt(topic: str) -> str:
        return (
            "I think I might be looping. Use the check_rumination tool to judge whether I've been "
            f"repeating myself about this within our recent conversation:\n\n{topic}\n\n"
            "If I am looping, surface my earlier reasoning and gently say so — do not generate a "
            "fresh round of analysis. This is advisory; it never blocks me."
        )
