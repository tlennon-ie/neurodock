# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Bundled, language-neutral package-data.

Currently holds a byte-identical copy of ``@neurodock/core``'s
``data/neurotype-addenda/v1.json`` (ADR 0012), kept in sync by the divergence
guard in ``tests/test_artifact_parity.py``. The copy lives inside the wheel so
the assembler never needs a filesystem read of the monorepo (this also makes the
hosted-remote Worker bundling straightforward).
"""
