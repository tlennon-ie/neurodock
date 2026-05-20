"""NeuroDock guardrail MCP server.

All three detectors are live at v0.0.2:

- ``check_rumination`` — word-overlap Jaccard heuristic.
- ``check_hyperfocus`` — elapsed-threshold-with-end-of-day heuristic.
- ``check_sycophancy`` — four-pattern overlap heuristic.

Heuristics are public and auditable; thresholds are defaults, not
prescriptions. See ``ETHICS.md`` and ADR 0006 for the contract.

The server is intentionally stateless: it persists nothing, opens no network
sockets, and never logs user content.
"""

__version__ = "0.0.2"
