"""NeuroDock guardrail MCP server.

Phase 2 deliverable: rumination detection via word-overlap Jaccard. The
``check_hyperfocus`` and ``check_sycophancy`` schemas are locked but their
runtimes return ``DETECTOR_NOT_YET_IMPLEMENTED`` until Phase 3 per
``docs/decisions/0006-guardrail-tool-design.md``.

The server is intentionally stateless: it persists nothing, opens no network
sockets, and never logs user content. See ``ETHICS.md`` and ADR 0006 for the
full contract.
"""

__version__ = "0.0.1"
