"""Unit tests for the word-overlap Jaccard heuristic.

These tests pin the maths: any future tweak to tokenisation, the stoplist,
or the formula will surface here. Per ADR 0006, changes to either the
heuristic or the stoplist require clinical-reviewer sign-off.
"""

from __future__ import annotations

from neurodock_mcp_guardrail.heuristics._stopwords import ENGLISH_STOPWORDS
from neurodock_mcp_guardrail.heuristics.rumination import jaccard_similarity


def test_identical_strings_score_one() -> None:
    # ND-realistic prompt: a question someone with OCD might re-ask.
    prompt = "should I really use Postgres for this?"
    assert jaccard_similarity(prompt, prompt) == 1.0


def test_disjoint_content_words_score_zero() -> None:
    a = "Postgres beats SQLite"
    b = "vegetables wait quietly"
    assert jaccard_similarity(a, b) == 0.0


def test_stopword_only_overlap_scores_zero() -> None:
    # Two prompts that share only stop words. The score MUST be 0.0 — the
    # whole point of the stoplist is to keep "the the the" from registering
    # as semantic similarity.
    a = "is this the right one?"
    b = "this is a wrong"
    score = jaccard_similarity(a, b)
    assert score == 0.0


def test_paraphrase_scores_reasonably() -> None:
    # Real ND-feeling re-validation: the same anxiety, slightly different
    # phrasing. We do not pin a precise score — the field study calibrates
    # the default 0.55 threshold — but the score must clearly exceed
    # disjoint content (0.0) and stay below identical (1.0).
    a = "should I really use Postgres for this?"
    b = "should I use Postgres or SQLite for this?"
    score = jaccard_similarity(a, b)
    assert 0.0 < score < 1.0
    # After stoplist (should, i, really, for, this, or are all stopwords):
    # A = {use, postgres}; B = {use, postgres, sqlite}.
    # Intersection = 2, union = 3 → 2/3.
    assert abs(score - 2 / 3) < 1e-6


def test_case_insensitive_tokenisation() -> None:
    a = "POSTGRES vs SQLite"
    b = "postgres beats sqlite"
    # Content tokens A = {postgres, vs, sqlite}, B = {postgres, beats, sqlite}.
    # vs is not in the stoplist; beats is not either. So union = 4,
    # intersection = 2 → 0.5.
    assert abs(jaccard_similarity(a, b) - 0.5) < 1e-6


def test_punctuation_does_not_split_words_incorrectly() -> None:
    # The tokeniser strips trailing punctuation; "postgres," and "postgres"
    # should be the same token.
    a = "postgres, sqlite, and friends"
    b = "postgres and sqlite"
    score = jaccard_similarity(a, b)
    # Content tokens A = {postgres, sqlite, friends}, B = {postgres, sqlite}
    # (and is a stopword). Union = 3, intersection = 2 → 2/3.
    assert abs(score - 2 / 3) < 1e-6


def test_stopword_list_is_frozenset() -> None:
    # Sanity: the stoplist is immutable as exported. Tests that mutate state
    # would otherwise leak across the suite.
    assert isinstance(ENGLISH_STOPWORDS, frozenset)
    assert "the" in ENGLISH_STOPWORDS
    assert "postgres" not in ENGLISH_STOPWORDS
