# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the shared at-rest token cipher (ADR 0010 Phases C/D).

Uses the real ``cryptography`` Fernet path so the at-rest guarantee is genuinely
tested. Skips cleanly when ``cryptography`` is not installed.
"""

from __future__ import annotations

import importlib.util

import pytest

_HAS_CRYPTO = importlib.util.find_spec("cryptography") is not None

pytestmark = pytest.mark.skipif(
    not _HAS_CRYPTO, reason="requires the optional cryptography package"
)

if _HAS_CRYPTO:
    from neurodock_state.crypto import MasterKeyError, TokenCipher


def test_round_trips_a_token() -> None:
    cipher = TokenCipher("a-strong-master-key")
    blob = cipher.encrypt("super-secret")
    assert blob != "super-secret"
    assert cipher.decrypt(blob) == "super-secret"


def test_requires_a_non_empty_master_key() -> None:
    with pytest.raises(MasterKeyError):
        TokenCipher("   ")


def test_same_master_key_decrypts_across_instances() -> None:
    # Two processes configured with the same key must interoperate.
    blob = TokenCipher("shared-key").encrypt("t")
    assert TokenCipher("shared-key").decrypt(blob) == "t"


def test_wrong_master_key_fails_loudly() -> None:
    blob = TokenCipher("key-one").encrypt("t")
    with pytest.raises(MasterKeyError):
        TokenCipher("key-two").decrypt(blob)
