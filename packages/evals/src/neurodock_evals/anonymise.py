# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Regex-based anonymiser for contributed eval examples.

A safety net, not a substitute for human judgement — see `CONTRIBUTING.md`.

Pipeline order matters: we strip URLs first (because they often contain
email-like patterns), then emails, then phones, then keys, then names, then
code-block bodies. Idempotency is verified by re-running the pipeline against
already-redacted text; redacted markers (`[email]`, etc.) are stable across
passes.

The `ANONYMISATION_PASS_VERSION` constant is bumped whenever the pipeline
changes. Examples track the version they were processed with so the curator
can re-run the new pipeline against the old corpus safely.
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Final

import yaml

logger = logging.getLogger(__name__)

ANONYMISATION_PASS_VERSION: Final = 1

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)
# Phones: a leading + or (xxx) plus 7+ digits possibly broken up by spaces, dots, or hyphens.
# Total digit count must be at least 7 (to avoid eating dates/version numbers).
_PHONE_RE = re.compile(
    r"(?<![\w@])\+?\d[\d\s().\-]{6,}\d(?![\w@])",
)
# Stripe-style live keys and generic high-entropy secret-looking tokens.
_SECRET_RE = re.compile(
    r"\b(?:sk|pk|rk|api|key|token|secret)[_-][A-Za-z0-9_\-]{12,}\b",
    re.IGNORECASE,
)
# Code fence: ```lang\n...\n``` — preserve `lang` tag, redact body.
_CODE_FENCE_RE = re.compile(r"```([A-Za-z0-9_+\-]*)\n(.*?)\n```", re.DOTALL)

# Proper-noun heuristic: a capitalised word that isn't sentence-initial and
# isn't one of a small allow-list. We err on the side of false positives.
_ALLOWLIST_CAPS = frozenset(
    {
        "I",
        "I'm",
        "I'll",
        "I've",
        "I'd",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
        "Q1",
        "Q2",
        "Q3",
        "Q4",
        "PR",
        "API",
        "URL",
        "JSON",
        "YAML",
        "HTTP",
        "HTTPS",
        "CI",
        "CD",
        "TODO",
        "FIXME",
        "OK",
        "OKR",
        "OKRs",
        "MCP",
        "ND",
        "LLM",
        "LLMs",
        "SDK",
        # Already-redacted markers must be allow-listed so passes are idempotent.
        "[name]",
        "[email]",
        "[url]",
        "[phone]",
        "[secret]",
        "[redacted]",
    }
)


def _redact_code_fences(text: str) -> str:
    """Replace fenced-code bodies with `[redacted]` but keep the language tag."""

    def replace(match: re.Match[str]) -> str:
        lang = match.group(1)
        return f"```{lang}\n[redacted]\n```"

    return _CODE_FENCE_RE.sub(replace, text)


def _is_proper_noun_token(token: str, prev_token: str | None) -> bool:
    """Decide whether `token` looks like a proper noun we should redact.

    Rules:
      - already a redaction marker: false (idempotency)
      - in the allow-list: false
      - capitalised AND not at sentence start: true
      - capitalised AND at sentence start AND followed by another caps token: true
        (catches "Acme launches Foo")
    """

    if not token:
        return False
    if token in _ALLOWLIST_CAPS:
        return False
    if not token[0].isupper():
        return False
    if not token[1:].islower() and len(token) > 1 and not token[1:].isalpha():
        # ALL-CAPS acronyms with non-alpha — leave alone.
        return False
    if prev_token is None:
        return False
    # Sentence-initial detection: previous token ends with sentence punctuation
    # (or is empty/none). If sentence-initial, only flag when token doesn't
    # look like the start of a new sentence describing a proper noun.
    sentence_initial = prev_token.endswith((".", "!", "?", ":", "\n"))
    if sentence_initial:
        return False
    return True


def _redact_proper_nouns(text: str) -> str:
    """Best-effort proper-noun redaction with capitalisation + position heuristics."""

    tokens = re.split(r"(\s+|[,.;:!?\"'()\[\]{}])", text)
    out: list[str] = []
    last_meaningful: str | None = None
    for tok in tokens:
        if not tok.strip() or (len(tok.strip()) == 1 and not tok.strip().isalnum()):
            out.append(tok)
            continue
        if _is_proper_noun_token(tok, last_meaningful):
            out.append("[name]")
        else:
            out.append(tok)
        last_meaningful = tok
    return "".join(out)


def anonymise_text(text: str) -> str:
    """Run every redaction pass on a single string.

    Idempotent: re-running on already-anonymised text returns the same string.
    """

    redacted = _redact_code_fences(text)
    redacted = _URL_RE.sub("[url]", redacted)
    redacted = _EMAIL_RE.sub("[email]", redacted)
    redacted = _SECRET_RE.sub("[secret]", redacted)
    redacted = _PHONE_RE.sub("[phone]", redacted)
    redacted = _redact_proper_nouns(redacted)
    return redacted


def _walk_strings(payload: object) -> Iterable[tuple[list[str | int], str]]:
    """Yield (path, value) for every string in a nested structure."""

    if isinstance(payload, str):
        yield ([], payload)
        return
    if isinstance(payload, dict):
        for key, value in payload.items():
            for sub_path, sub_value in _walk_strings(value):
                yield ([key, *sub_path], sub_value)
        return
    if isinstance(payload, list):
        for idx, item in enumerate(payload):
            for sub_path, sub_value in _walk_strings(item):
                yield ([idx, *sub_path], sub_value)
        return


def _set_at_path(payload: object, path: list[str | int], value: str) -> None:
    target = payload
    for key in path[:-1]:
        if isinstance(target, dict) and isinstance(key, str):
            target = target[key]
        elif isinstance(target, list) and isinstance(key, int):
            target = target[key]
        else:  # pragma: no cover — defensive
            raise TypeError(f"Cannot descend into {type(target).__name__} at key {key!r}")
    last = path[-1]
    if isinstance(target, dict) and isinstance(last, str):
        target[last] = value
    elif isinstance(target, list) and isinstance(last, int):
        target[last] = value
    else:  # pragma: no cover — defensive
        raise TypeError(f"Cannot set on {type(target).__name__} at key {last!r}")


def anonymise_example_payload(payload: dict[str, object]) -> dict[str, object]:
    """Walk a parsed example YAML and redact every string value under `input`.

    The `expected` block is left alone — it's structured analysis written by
    the curator/rater, not raw message content.
    """

    if "input" not in payload:
        return payload
    input_payload = payload["input"]
    if not isinstance(input_payload, dict):
        return payload
    for path, value in list(_walk_strings(input_payload)):
        redacted = anonymise_text(value)
        if redacted != value:
            _set_at_path(input_payload, path, redacted)
    consent = payload.get("consent")
    if isinstance(consent, dict):
        consent["anonymisation_pass"] = ANONYMISATION_PASS_VERSION
    return payload


def _format_diff(before: str, after: str) -> str:
    if before == after:
        return "(no changes)"
    return f"--- before\n{before}\n--- after\n{after}\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="neurodock_evals.anonymise",
        description="Redact a contributed eval example's input block.",
    )
    parser.add_argument("path", type=Path, help="Path to the YAML example.")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Write the redacted YAML back to the file. Default prints to stdout.",
    )
    args = parser.parse_args(argv)
    if not args.path.exists():
        logger.error("Path not found: %s", args.path)
        return 2
    raw = args.path.read_text(encoding="utf-8")
    parsed = yaml.safe_load(raw)
    if not isinstance(parsed, dict):
        logger.error("Top-level YAML is not a mapping: %s", args.path)
        return 2
    redacted = anonymise_example_payload(parsed)
    out = yaml.safe_dump(redacted, sort_keys=False, allow_unicode=True)
    if args.in_place:
        args.path.write_text(out, encoding="utf-8")
        logger.info("Wrote redacted YAML to %s", args.path)
        return 0
    sys.stdout.write(out)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
