# Test invocations — asd-meeting-translator

Each `NN-<name>.md` file in this directory is a single test invocation for the skill. They are executable against a reference MCP client (see `packages/evals/` for the harness) and gate skill releases in CI.

## Format

Every test file has exactly four top-level sections, in this order:

1. **Scenario** — one paragraph describing the user's invoking message, their profile-relevant settings (`identity.display_name`, `identity.neurotypes`), and the state of the transcript + cognitive graph at test time. This is the input contract.
2. **Expected MCP tool sequence** — an ordered list of MCP tool calls the skill must make, each annotated with the expected return shape. The order matters: the runner compares the actual call trace to this list and fails on the first divergence.
3. **Expected response shape** — a description of the rendered output. Not a verbatim string match (LLM output varies); a structural contract (sections present, ordering, prohibited phrases, verbatim-quote checks, length envelope).
4. **Pass criteria** — a checklist the runner can score against. Each item is independently observable on the rendered response or the recorded MCP trace.

## Conventions

- Tool calls reference the schemas in `packages/mcp-translation/schemas/` and `packages/mcp-cognitive-graph/schemas/`. The runner validates each fake return against its schema before injecting it.
- Ambiguous items in the response are compared by `quoted_span.text == transcript.slice(start_char, end_char)`. Any deviation fails the test, mirroring the `VERBATIM_ANCHOR_FAILED` guarantee.
- Reason codes use the v0.1.0 enum from `brief_meeting.schema.json`: `vague_timeline | vague_referent | unassigned_owner | hedged_commitment | deferred_topic | contested | other`. Unknown codes are normalised to `other`.
- Prohibited phrases (per voice and the `Do not` block in `SKILL.md`) are tested explicitly: `autistic`, `neurodivergent`, `spectrum`, `executive function`, `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `clinical`.
- `record_fact` writes are asserted by call count and shape. Asks and ambiguous items must never be recorded.

## Adding a new test

A new test invocation is in scope when it covers a code path the existing three do not (e.g. `TRANSCRIPT_TOO_LONG`, `ME_REQUIRED` clarification flow, distress-signal handling). A new test for an existing path is duplication and should not be merged.
