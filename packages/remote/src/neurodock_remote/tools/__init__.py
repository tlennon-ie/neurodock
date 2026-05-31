# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Remote-server-owned tools (ADR 0010 Phase D).

These tools exist only on the hosted endpoint and have no local-stdio analogue:
the storage-admin tools (connect/disconnect/status) and the un-gated
cognitive-graph tools that route to the caller's own BYOS database.
"""
