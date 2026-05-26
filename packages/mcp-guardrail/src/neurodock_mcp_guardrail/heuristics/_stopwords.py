# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Hand-rolled English stoplist for the word-overlap Jaccard heuristic.

NOTE (clinical review): Per ADR 0006 §6 and ``ETHICS.md`` commitment 3, any
change to this stoplist or to the Jaccard implementation in ``rumination.py``
requires ``clinical-reviewer`` sign-off and consultation with the clinical
advisory board. The list is deliberately small (~60 words) and surface-level
so users auditing a detection can read it and the rule code together. Bigger
lists (NLTK, spaCy) are deliberately avoided to keep the heuristic
transparent and dependency-free.

CODEOWNERS: ``packages/mcp-guardrail/src/neurodock_mcp_guardrail/heuristics/``
should be guarded by ``clinical-reviewer`` per ADR 0006.
"""

from __future__ import annotations

# ~60 English function words. Lowercase, no punctuation. Mirrors the schema
# description that says "removes a 60-word stoplist".
ENGLISH_STOPWORDS: frozenset[str] = frozenset(
    {
        "a",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "been",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "for",
        "from",
        "had",
        "has",
        "have",
        "he",
        "her",
        "here",
        "his",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "just",
        "me",
        "my",
        "no",
        "not",
        "of",
        "on",
        "or",
        "our",
        "out",
        "really",
        "she",
        "should",
        "so",
        "such",
        "than",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "to",
        "too",
        "us",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
    }
)
