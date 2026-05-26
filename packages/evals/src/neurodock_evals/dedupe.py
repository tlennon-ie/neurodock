# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""SimHash-style fingerprinting for near-duplicate detection.

We don't ship a heavyweight similarity library because:
  - the corpus is small,
  - the harness must be air-gapped,
  - the deduper has to be reproducible across Python versions.

The fingerprint is a 64-bit integer computed from token tri-grams. Two
examples are considered near-duplicates if their Hamming distance is below
`NEAR_DUPLICATE_THRESHOLD` (default 4). The harness refuses to load a corpus
with intra-slice near-duplicates.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Final

FINGERPRINT_BITS: Final = 64
NEAR_DUPLICATE_THRESHOLD: Final = 4

_TOKEN_RE = re.compile(r"[A-Za-z0-9']+")


def _tokenise(text: str) -> list[str]:
    return [tok.lower() for tok in _TOKEN_RE.findall(text)]


def _trigrams(tokens: list[str]) -> list[tuple[str, str, str]]:
    if len(tokens) < 3:
        # Pad short inputs so they still produce a usable fingerprint.
        padded = tokens + ["\x00"] * (3 - len(tokens))
        return [(padded[0], padded[1], padded[2])]
    return [(tokens[i], tokens[i + 1], tokens[i + 2]) for i in range(len(tokens) - 2)]


def _feature_hash(feature: tuple[str, ...]) -> int:
    digest = hashlib.blake2b("\x1f".join(feature).encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def fingerprint(text: str) -> int:
    """Return a 64-bit SimHash-style fingerprint of `text`."""

    tokens = _tokenise(text)
    features = Counter(_trigrams(tokens))
    if not features:
        return 0
    weights = [0] * FINGERPRINT_BITS
    for feature, weight in features.items():
        hashed = _feature_hash(feature)
        for bit in range(FINGERPRINT_BITS):
            if hashed >> bit & 1:
                weights[bit] += weight
            else:
                weights[bit] -= weight
    out = 0
    for bit in range(FINGERPRINT_BITS):
        if weights[bit] > 0:
            out |= 1 << bit
    return out


def hamming_distance(a: int, b: int) -> int:
    """Bit-count of the XOR — standard Hamming distance for fixed-width ints."""

    return (a ^ b).bit_count()


def find_near_duplicates(
    texts: list[tuple[str, str]],
    threshold: int = NEAR_DUPLICATE_THRESHOLD,
) -> list[tuple[str, str, int]]:
    """Return (id_a, id_b, distance) tuples for every near-duplicate pair.

    Inputs: list of (id, text) tuples. The same id MUST NOT appear twice.
    """

    fingerprints = [(idx, fingerprint(text)) for idx, text in texts]
    pairs: list[tuple[str, str, int]] = []
    for i in range(len(fingerprints)):
        id_a, fp_a = fingerprints[i]
        for j in range(i + 1, len(fingerprints)):
            id_b, fp_b = fingerprints[j]
            distance = hamming_distance(fp_a, fp_b)
            if distance < threshold:
                pairs.append((id_a, id_b, distance))
    return pairs
