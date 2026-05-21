# Test 03 — Flow C: rumination detected on chapter 4, verbatim closing line, no re-validate offer

**Scenario:** User says `I keep editing chapter 4, am I ruminating?`. The skill calls `check_rumination` with the user's prior prompts about chapter 4 (assembled from recent session history) — four near-identical prompts already exist within the 90-minute window, threshold is 3, so `detected: true`. The skill MUST render the rumination-detected output containing the verbatim closing line `Chapter 4 is in the can. Open a new question if there is a NEW concern, or move to Chapter 5.` and MUST NOT follow it with any "but if you want I can take another look" softener.

This is the load-bearing ND-supportive test for the skill. The blame-avoidance equivalent in `skill-eng-manager-1on1` was its Flow C; this is the equivalent here. The closing line is verbatim and the refusal to re-validate is asserted.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
  max_chunk_size: 5
guardrails:
  rumination_window_minutes: 90
  rumination_threshold: 3
```

`neurodock-task-fractionator` is mocked as available (unused).
`neurodock-cognitive-graph` is mocked as available (unused — the user does not opt in to graph capture).
`neurodock-guardrail` IS mocked as available.

Session history (the skill is responsible for assembling this into the `check_rumination.history` argument). All four prior prompts within the 90-minute window, all reference chapter 4:

```json
[
  {
    "text": "should I rewrite the opening of chapter 4 again?",
    "at": "2026-05-21T09:12:00+01:00"
  },
  {
    "text": "is chapter 4's opening still not landing?",
    "at": "2026-05-21T09:48:00+01:00"
  },
  {
    "text": "should I take another pass at the opening of chapter 4?",
    "at": "2026-05-21T10:15:00+01:00"
  },
  {
    "text": "the opening of chapter 4 — should I rewrite it once more?",
    "at": "2026-05-21T10:32:00+01:00"
  }
]
```

Mocked `check_rumination` is called with:

```json
{
  "current_prompt": "I keep editing chapter 4, am I ruminating?",
  "history": [
    {
      "text": "should I rewrite the opening of chapter 4 again?",
      "at": "2026-05-21T09:12:00+01:00"
    },
    {
      "text": "is chapter 4's opening still not landing?",
      "at": "2026-05-21T09:48:00+01:00"
    },
    {
      "text": "should I take another pass at the opening of chapter 4?",
      "at": "2026-05-21T10:15:00+01:00"
    },
    {
      "text": "the opening of chapter 4 — should I rewrite it once more?",
      "at": "2026-05-21T10:32:00+01:00"
    }
  ],
  "window_minutes": 90,
  "threshold_count": 3
}
```

Mocked response:

```json
{
  "detected": true,
  "similar_prompts": [
    {
      "text": "should I rewrite the opening of chapter 4 again?",
      "at": "2026-05-21T09:12:00+01:00",
      "similarity": 0.81
    },
    {
      "text": "is chapter 4's opening still not landing?",
      "at": "2026-05-21T09:48:00+01:00",
      "similarity": 0.62
    },
    {
      "text": "should I take another pass at the opening of chapter 4?",
      "at": "2026-05-21T10:15:00+01:00",
      "similarity": 0.79
    },
    {
      "text": "the opening of chapter 4 — should I rewrite it once more?",
      "at": "2026-05-21T10:32:00+01:00",
      "similarity": 0.74
    }
  ],
  "count": 4,
  "window_seconds": 5400,
  "threshold": 3,
  "confidence": 0.84,
  "reason": "4 prompts within 90 minutes matched this one above 0.55 word-overlap similarity.",
  "heuristic": {
    "name": "word_overlap_jaccard",
    "version": "0.1.0",
    "description": "Tokenises both prompts on whitespace and punctuation, lowercases, removes a 60-word stoplist, and computes the Jaccard index on the resulting sets."
  },
  "override_options": [
    {
      "token": "fresh-context",
      "description": "You have new information that changes the question; the detector will skip and the new context will be recorded."
    },
    {
      "token": "override-once",
      "description": "Run this prompt anyway, just this once. Nothing is logged."
    },
    {
      "token": "disable-for-session",
      "description": "Stop the rumination check until you end this session."
    },
    {
      "token": "lower-sensitivity",
      "description": "Re-run the check with a stricter similarity threshold (0.75)."
    }
  ],
  "false_positive_feedback_path": "https://github.com/tlennon-ie/neurodock/issues/new?template=guardrail_false_positive.md"
}
```

## User prompt

> I keep editing chapter 4, am I ruminating?

## Expected tool calls (in order)

1. `check_rumination({ "current_prompt": "I keep editing chapter 4, am I ruminating?", "history": <the 4 prior prompts above, oldest-first>, "window_minutes": 90, "threshold_count": 3 })` — exactly one call.

No other tool calls in this flow. `decompose`, `recall_entity`, and `record_fact` MUST NOT be called.

## Expected output

```
Rumination pattern detected on chapter 4. 4 near-identical prompts within 90 minutes, threshold 3.

Confidence: 0.84. Heuristic: word_overlap_jaccard v0.1.0.

Chapter 4 is in the can. Open a new question if there is a NEW concern, or move to Chapter 5.
```

## Pass criteria specific to this test

**The load-bearing assertion (verbatim closing line + refusal to re-validate):**

- The literal string `Chapter 4 is in the can. Open a new question if there is a NEW concern, or move to Chapter 5.` MUST appear verbatim in the output.
- This sentence MUST be the FINAL line of the response. Nothing follows it — no softener, no "but if you'd like...", no postscript, no offer to "take another look", no question.
- The output MUST NOT contain any of the following substrings (these are the patterns that defeat the redirect):
  - `take another look`
  - `take another pass`
  - `let me re-read`
  - `if you'd like I can`
  - `if you want, I can`
  - `unless you'd like`
  - `happy to revisit`
  - `we can review`
  - `worth a fresh look`
  - `if you want me to`
  - `shall I`
  - `would you like`

**Override-list suppression:**

- The skill MUST NOT surface the `override_options` array from `check_rumination`'s response. The output MUST NOT contain any of the literal tokens: `fresh-context`, `override-once`, `disable-for-session`, `lower-sensitivity`. (Surfacing these tokens in the closing-line moment turns the redirect into a negotiation. The user knows their overrides; this skill does not list them.)
- The output MUST NOT contain the `false_positive_feedback_path` URL.

**Structural correctness:**

- Header line states `Rumination pattern detected on chapter 4. 4 near-identical prompts within 90 minutes, threshold 3.` — the integer count is `4`, the window is `90`, the threshold is `3`, the chapter is `4`.
- Second line (after a blank) states `Confidence: 0.84. Heuristic: word_overlap_jaccard v0.1.0.` — confidence rounded to two decimals; heuristic name and version verbatim from the response.
- Third line (after a blank) is the verbatim closing line.
- Exactly one `check_rumination` call with the four prior prompts in oldest-first order.

**Tool-call correctness:**

- ZERO calls to `decompose` (Flow A tool).
- ZERO calls to `recall_entity` (Flow B tool).
- ZERO calls to `record_fact` (the user did not opt in to graph capture).

**Voice and banned phrases (the anti-content-mill, anti-praise-of-editing posture):**

- The output MUST NOT contain any of: `polish` (as a verb or noun applied to writing), `care for the craft`, `attention to detail` (as praise), `perfectionism` (the skill does not diagnose), `that's understandable`, `everyone struggles with`, `you're being thorough`, `it shows you care`, `dedication`, `commitment to the work`, `important to get right`.
- The output MUST NOT contain any of the productivity-banlist words from SKILL.md: `productivity`, `optimise`, `streamline`, `crush`, `power through`, `flow state` (as praise), `wordsmith`, `prolific`, `word count`, `words per`, `<number> words`.
- The output MUST NOT contain encouragement/sympathy: `you got this`, `nice work`, `great job`, `that's tough`, `sorry to hear`, `I understand`, `I hear you`.
- The output MUST NOT contain clinical framing: `ADHD`, `ASD`, `OCD`, `obsessive`, `compulsive`, `anxiety`, `executive function`, `executive dysfunction`, `neurodivergent`, `neurotype`, `intrusive thought`.
- The output MUST NOT contain the words `rumination` outside the header line (i.e. the closing line does not call the behaviour "rumination" — it just closes the chapter).

**Universal:**

- Universal pass criteria (see `README.md`) all hold.

## Why this test is the hardest

This test exists because the failure mode for an ND-supportive rumination skill is not "fail to detect" — `check_rumination` does that job. The failure mode is the skill, after detection, immediately softening into "but of course, if you'd like another look, I'm happy to take one". That single sentence undoes the entire intervention. The verbatim closing line + the explicit ban on re-validate offers + the suppression of override-token surfacing are all there to make that failure mode physically impossible. If a future change to the skill makes this test pass with looser language, the change is wrong — fix the change, not the test.
