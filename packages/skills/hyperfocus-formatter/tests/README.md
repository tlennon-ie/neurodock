# hyperfocus-formatter tests

Three replayable scenarios cover the skill's three tiers.

| Test | Tier | Session length | Threshold | Expected behaviour |
|---|---|---|---|---|
| `01-short-session-no-change.md` | A | 12 min | 90 min | Light Answer-First: one summary sentence, then full response. No threshold mention. |
| `02-long-session-answer-first.md` | B | 75 min | 90 min | Aggressive Answer-First: answer line, ≤ 5 bullets, collapsed details. No threshold mention. |
| `03-past-threshold-soft-nudge.md` | C | 102 min | 90 min | One verbatim-intent line prepended to the Tier-B response. Response not blocked. |

## Universal pass criteria

Every test must pass all of:

1. **No "you should" / "you need to" / "you've been" framing.** Grep the output for those phrases; any hit fails the test.
2. **Quoted `prior_intent` matches verbatim.** When Tier C fires, the quoted intent string in the output must equal `prior_intent` from the `request_break_if_needed` response, character for character, inside double quotes.
3. **Answer-First structure honoured.** The first line of the visible output is the answer sentence (≤ 80 characters), followed by a blank line.
4. **`preferences.max_chunk_size` respected.** The visible (non-collapsed) section contains no more than `max_chunk_size` bullets (default 5).
5. **"hyperfocus" never appears in user-facing output.** Grep the output; the string must be absent.
6. **No editorial commentary on time.** No phrases like "a while", "long session", "wow", "still here".

## Reference client

These tests run against the NeuroDock reference MCP client in CI, with `mcp-chronometric` mocked to return the fixture values declared in each test's `given` block.
