# audhd-context-recovery — test invocations

Each test in this directory describes a scenario, the expected MCP tool sequence, the expected response shape, and the pass criteria. CI replays these against a reference MCP client and the skill must produce output that meets the pass criteria.

## Test format

Each test file uses these sections:

- **Scenario** — one paragraph describing the user state and trigger.
- **Fixture state** — the cognitive graph and chronometric state CI sets up before the run.
- **Expected MCP tool sequence** — the ordered list of MCP calls the skill must make. Calls may include exact argument shapes.
- **Expected response shape** — the structural contract for the skill's reply (sections, ordering, what must and must not appear).
- **Pass criteria** — the boolean checks CI runs against the reply.

Tests must NOT assert on exact LLM wording. They assert on tool calls, structure, and the presence/absence of specific facts.

## Files

- `01-resume-after-overnight.md` — happy path: `/resume` after 14 hours, clear last project.
- `02-resume-with-explicit-project.md` — alias-resolution path: `/resume Phase 0 RFC` with method="alias", score 0.92.
- `03-resume-after-long-gap.md` — long-gap path: `/resume` after 12 days, since-window must widen.
