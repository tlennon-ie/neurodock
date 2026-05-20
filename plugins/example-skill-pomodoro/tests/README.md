# example-skill-pomodoro tests

Three replayable scenarios cover the skill's full lifecycle: open, mid-session check, break trigger, close.

| Test | Scenario | Duration | Expected behaviour |
|---|---|---|---|
| `01-start-25min-pomodoro.md` | Default 25-minute start | 25 min | Skill calls `mark_session_start` with intent parsed from the user message. One-line confirmation returned. |
| `02-custom-duration.md` | User-specified 50-minute block with explicit intent | 50 min | Skill calls `mark_session_start` with the user's stated intent. Tracks the 50-minute threshold for the later break trigger. |
| `03-break-trigger.md` | Full lifecycle: start, wait, break trigger, close | 25 min | Skill surfaces a break suggestion once `current_session_length >= PT25M`, then closes on user's "done", then records the optional Pomodoro fact. |

## How tests run

Skill tests are replayed in CI against the NeuroDock reference MCP client. Each test file declares:

1. **Given** — the profile fragment and the mocked tool responses the reference client will return.
2. **User prompt(s)** — what the simulated user types.
3. **Expected tool calls** — the exact MCP tool invocations the skill must make, in order.
4. **Expected output** — what the skill emits to the user.
5. **Pass criteria** — extra assertions beyond the universal pass criteria below.

The reference client mocks `mcp-chronometric` (and `mcp-cognitive-graph` when relevant) to return the fixture values declared in each test's `given` block. The skill is then driven by replaying the user prompts in sequence.

## Universal pass criteria

Every test must pass all of:

1. **Verbatim `prior_intent`.** When the skill surfaces a break suggestion, the quoted intent in the output equals `prior_intent` from `request_break_if_needed`, character for character, inside double-quotes.
2. **No editorialising.** No phrases like "nice", "great session", "you've been at this", "almost there", "good job".
3. **No fabricated `suggested_action` values.** The skill emits the exact enum value returned by `request_break_if_needed`.
4. **Answer First.** Every emitted line is short (≤ ~100 characters) and leads with the data the user asked for.
5. **No clinical framing.** The word "ADHD", "ASD", "executive function", "dysfunction" must not appear in user-facing output.
6. **Single session invariant.** The skill does not call `mark_session_start` twice without an intervening `mark_session_end`.
7. **`record_fact` is conditional.** The skill calls `record_fact` only when `mcp-cognitive-graph` is mocked as available AND `mark_session_end` returned `duration >= PT20M`. Tests that do not declare the cognitive-graph mock available must not see a `record_fact` call.

## Running locally

When the NeuroDock reference client and skill replay harness are installed:

```bash
neurodock skill test plugins/example-skill-pomodoro
```

This walks the `tests/` directory, replays each `.md` file against the reference client, and asserts the universal + per-test pass criteria. Output is one line per test (pass/fail) plus a structured diff on any failure.

The harness is part of `@neurodock/skill-sdk`; pinning it as a dev dependency is the recommended path for plugin authors.
