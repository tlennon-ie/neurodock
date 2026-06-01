# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""At-rest secret encryption keyed by the operator master key (ADR 0010 Phases C/D).

NeuroDock holds two kinds of per-user secret on the hosted path: the BYOS auth
token (Phase D) and the NeuroDock-provisioned Turso DB token (Phase C). Both are
written into the user's Clerk ``private_metadata`` and so must be encrypted at
rest. This module is the single place that knows how: a :class:`Fernet` cipher
derived from ``NEURODOCK_STATE_MASTER_KEY``.

Why factor it out of ``clerk_byos_store``?
-----------------------------------------
Phase D embedded the Fernet derivation inside the BYOS store. Phase C needs the
exact same scheme for the hosted Turso token, so the derivation lives here and
both stores call it. The behaviour is byte-for-byte identical to the Phase D
implementation (SHA-256 of the master key → url-safe-base64 → Fernet), so
already-stored Phase D tokens decrypt unchanged.

The ``cryptography`` package is imported **lazily** inside the helpers so simply
importing this module never fails on a host that lacks it (the base
:mod:`neurodock_state` package stays dependency-light; the hosted image installs
the ``clerk`` extra which pulls ``cryptography``).

Honest limitation (ADR 0010 open question — encryption key custody)
-------------------------------------------------------------------
A single operator-wide ``NEURODOCK_STATE_MASTER_KEY`` means NeuroDock can
technically decrypt every stored token. This is the documented Phase C trade-off;
per-user / envelope keys (so the operator cannot unilaterally read a user's DB
token) are a tracked follow-up. The on-disk format is unchanged either way, so a
future envelope scheme can re-wrap without a data migration.
"""

from __future__ import annotations

import base64
import hashlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - typing only
    from cryptography.fernet import Fernet

_MASTER_KEY_ENV = "NEURODOCK_STATE_MASTER_KEY"


class MasterKeyError(RuntimeError):
    """The master key is missing, or a stored secret could not be decrypted."""


def derive_fernet(master_key: str) -> Fernet:
    """Build a :class:`Fernet` from an arbitrary-length master-key string.

    Fernet requires a 32-byte url-safe-base64 key. We derive one deterministically
    from the operator-supplied master key with SHA-256 so the operator can use any
    sufficiently strong secret without having to pre-format it.

    The same string always yields the same cipher, so a token written by one
    process decrypts in any other process configured with the same master key.
    """
    from cryptography.fernet import Fernet

    digest = hashlib.sha256(master_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


class TokenCipher:
    """Encrypt/decrypt a single secret string with the operator master key.

    Construct once (the cipher is built eagerly so a broken ``cryptography``
    install fails at construction, not mid-request) and reuse for every token.
    """

    def __init__(self, master_key: str) -> None:
        master = master_key.strip()
        if not master:
            raise MasterKeyError(
                f"{_MASTER_KEY_ENV} is required to encrypt per-user secrets at rest"
            )
        self._fernet = derive_fernet(master)

    def encrypt(self, plaintext: str) -> str:
        """Return the ciphertext (url-safe ASCII) for ``plaintext``."""
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, blob: str) -> str:
        """Return the plaintext for a ciphertext produced by :meth:`encrypt`.

        Raises :class:`MasterKeyError` if the blob cannot be decrypted (most
        often a master-key mismatch), so a wrong key fails loudly rather than
        returning garbage.
        """
        from cryptography.fernet import InvalidToken

        try:
            return self._fernet.decrypt(blob.encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise MasterKeyError(
                f"a stored secret could not be decrypted (wrong {_MASTER_KEY_ENV}?)"
            ) from exc
