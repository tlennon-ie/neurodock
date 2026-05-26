# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the regex-based anonymiser."""

from __future__ import annotations

from neurodock_evals.anonymise import (
    ANONYMISATION_PASS_VERSION,
    anonymise_example_payload,
    anonymise_text,
)


def test_strips_email() -> None:
    redacted = anonymise_text("Ping me at jane.doe@example.com when ready.")
    assert "jane.doe@example.com" not in redacted
    assert "[email]" in redacted


def test_strips_url() -> None:
    redacted = anonymise_text("See https://acme.example.com/path?x=1 for details.")
    assert "acme.example.com" not in redacted
    assert "[url]" in redacted


def test_strips_phone() -> None:
    redacted = anonymise_text("Call +353 1 555 0123 if blocked.")
    assert "555" not in redacted
    assert "[phone]" in redacted


def test_strips_secret_token() -> None:
    redacted = anonymise_text("Use api_key_abcdef1234567890 to authenticate.")
    assert "api_key_abcdef1234567890" not in redacted
    assert "[secret]" in redacted


def test_preserves_code_block_language_tag() -> None:
    text = "```python\nsecret = 'abc'\nprint(secret)\n```"
    redacted = anonymise_text(text)
    assert "```python" in redacted
    assert "[redacted]" in redacted
    assert "secret = 'abc'" not in redacted


def test_idempotent_on_already_redacted_text() -> None:
    """Re-running the pipeline produces the same output."""

    once = anonymise_text("Contact jane@example.com or visit https://x.example.com")
    twice = anonymise_text(once)
    assert once == twice


def test_payload_walker_redacts_input_strings() -> None:
    payload: dict[str, object] = {
        "id": "test.001",
        "consent": {"anonymisation_pass": 0},
        "input": {
            "text": "Email me at jane@example.com",
            "thread_context": ["Slack handle: https://slack.example.com/jane"],
        },
        "expected": {"explicit_ask": "irrelevant for redaction"},
    }
    out = anonymise_example_payload(payload)
    input_block = out["input"]
    assert isinstance(input_block, dict)
    assert "[email]" in input_block["text"]
    thread = input_block["thread_context"]
    assert isinstance(thread, list)
    assert "[url]" in thread[0]
    consent = out["consent"]
    assert isinstance(consent, dict)
    assert consent["anonymisation_pass"] == ANONYMISATION_PASS_VERSION


def test_proper_noun_heuristic_redacts_company_name() -> None:
    text = "We talked to Acme yesterday."
    redacted = anonymise_text(text)
    assert "Acme" not in redacted
    assert "[name]" in redacted


def test_proper_noun_heuristic_preserves_sentence_initial() -> None:
    text = "Friday is the deadline."
    redacted = anonymise_text(text)
    # Friday is in the allow-list; the redactor must not nuke it.
    assert "Friday" in redacted
