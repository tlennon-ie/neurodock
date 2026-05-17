# Test invocations — ocd-decision-finalizer

Each `NN-<name>.md` file in this directory is a single test invocation for the skill. They are executable against a reference MCP client (see `packages/evals/` for the harness) and gate skill releases in CI. Because this skill is `clinical_review_required: false`, every test change additionally goes to the  agent before merge.

## Format

Every test file has exactly four top-level sections, in this order:

1. **Scenario** — one paragraph describing the user's invoking message, their profile-relevant settings (`identity.neurotypes` MUST include `"ocd"` for activation tests), and the state of the local cognitive graph at test time. This is the input contract.
2. **Expected MCP tool sequence** — an ordered list of MCP tool calls the skill must make, each annotated with the expected return shape. The order matters: the runner compares the actual call trace to this list and fails on the first divergence.
3. **Expected response shape** — a description of the rendered output. Not a verbatim string match (LLM output varies); a structural contract (sections present, ordering, prohibited phrases, override line presence, length envelope).
4. **Pass criteria** — a checklist the runner can score against. Each item is independently observable on the rendered response.

## Conventions

- Tool calls reference the schemas in `packages/mcp-cognitive-graph/schemas/`. The runner validates each fake return against its schema before injecting it.
- Decision names quoted in the response are matched against the verbatim `decisions[].name` returned by the fake `recall_decisions` call. Any paraphrase fails the test.
- Prohibited phrases (per  voice rules and the SKILL.md "Do not" section) are tested explicitly: `rumination`, `anxiety`, `obsessive`, `compulsive`, `spiral`, `loop`, `executive function`, `neurodivergent`, `executive dysfunction`, `intrusive`, plus the general-tone block list (`superpower`, `you got this`, `let's go`).
- When finality fires, the `--override "fresh-context"` line MUST be present. Absence fails the test — the ethics contract requires every guardrail-style intervention to be overridable.
- Response length envelopes are upper-bounds, expressed in characters (not tokens) so the test is vendor-neutral.

## Adding a new test

A new test invocation is in scope when it covers a code path the existing three do not. A new test for an existing path is duplication and should not be merged.
