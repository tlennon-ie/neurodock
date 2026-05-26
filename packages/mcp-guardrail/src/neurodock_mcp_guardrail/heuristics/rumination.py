# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Word-overlap Jaccard heuristic for ``check_rumination`` v0.1.0.

NOTE (clinical review): Per ADR 0006 and ``ETHICS.md`` commitment 3, any
change to this heuristic — including tokenisation, stoplist behaviour, or
the Jaccard formula — requires ``clinical-reviewer`` sign-off and
consultation with the clinical advisory board. The implementation is held
deliberately small so an auditing user can read the whole rule.

Auditable specification (per ADR 0006 §6 "Decision drivers" #3):

1. Lowercase both inputs.
2. Tokenise on whitespace and ASCII punctuation.
3. Drop tokens that are empty, all-punctuation, or in the English stoplist.
4. Compute the Jaccard index over the resulting token sets:
   ``len(A intersection B) / len(A union B)``.
5. If either set is empty after stoplisting, the score is ``0.0`` —
   stopword-only overlap does NOT score as similarity.
"""

from __future__ import annotations

import re
from typing import Literal

from neurodock_mcp_guardrail.heuristics._stopwords import ENGLISH_STOPWORDS

HEURISTIC_NAME: Literal["word_overlap_jaccard"] = "word_overlap_jaccard"
HEURISTIC_VERSION = "0.1.0"
HEURISTIC_DESCRIPTION = (
    "Tokenises both prompts on whitespace and punctuation, lowercases, removes "
    "a 60-word stoplist, and computes the Jaccard index on the resulting sets."
)

# Token boundary: any run of letters, digits, or apostrophes/underscores that
# we treat as in-word. Punctuation, whitespace, and other symbols are dropped.
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9_']*")


def _tokenize(text: str, *, stop_words: frozenset[str]) -> frozenset[str]:
    """Return the lowercased, stop-word-filtered token set of ``text``."""
    lowered = text.lower()
    raw_tokens = _TOKEN_RE.findall(lowered)
    return frozenset(token for token in raw_tokens if token and token not in stop_words)


def jaccard_similarity(
    a: str,
    b: str,
    *,
    stop_words: frozenset[str] = ENGLISH_STOPWORDS,
) -> float:
    """Return the Jaccard similarity of two prompts in ``[0.0, 1.0]``.

    Pure function. Stop words are filtered before the set comparison so that
    "is the the the the?" vs "this is a test" does NOT score above 0.0.
    """
    tokens_a = _tokenize(a, stop_words=stop_words)
    tokens_b = _tokenize(b, stop_words=stop_words)
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)
