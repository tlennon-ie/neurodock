# Test 03 — Flow C: translate an incoming email via translation-legal

**Scenario:** User says `translate this email for me` and pastes a four-sentence email from outside counsel containing two terms of art and three British-firm hedges. Both `mcp-translation` and the `translation-legal` pack are available. The skill calls `translate_incoming` once with `domain: "legal"`, then renders the response in the structure under "Output format — Flow C (with translation-legal)" in SKILL.md.

The translated content is the verbatim output of the translation-legal pack; this test asserts that the skill threads the response through to the user without editorialising, paraphrasing, or asserting binding legal effect.

## Given

Profile:

```yaml
identity:
  neurotypes: []
preferences:
  output_format: answer_first
plugins:
  translation-legal:
    enabled: true
```

`neurodock-cognitive-graph` IS mocked as available (but unused in Flow C).
`mcp-translation` IS mocked as available with `domain: legal` supported (the translation-legal pack is installed and its overrides have shadowed the base prompts).

Mocked `translate_incoming({ "text": "<pasted email>", "domain": "legal" })` returns:

```json
{
  "explicit_ask": "Confirm by end of business today that the warranty cap remains as drafted.",
  "ambiguity": {
    "spans": [
      {
        "phrase": "As a matter of housekeeping",
        "note": "Framing device that downgrades the surface importance of what follows; in practice the housekeeping clause is the real ask."
      },
      {
        "phrase": "broadly comfortable",
        "note": "We agree with most of the position but have specific reservations we are about to list."
      },
      {
        "phrase": "I'd be grateful if you could revert by close of play",
        "note": "Deadline is real (close of play = end of business that day); 'grateful' is etiquette, not optionality."
      },
      {
        "phrase": "I trust this is in order",
        "note": "Polite version of 'is this fine?' with an implicit close — if you do not push back, the sender will treat the position as accepted."
      }
    ]
  },
  "legal_terms_of_art": [
    {
      "term": "without prejudice",
      "effect": "The statement cannot be used against the sender in subsequent proceedings as an admission, typically."
    },
    {
      "term": "subject to contract",
      "effect": "Nothing in the correspondence is binding until a signed contract exists, typically."
    }
  ],
  "likely_subtext": [
    {
      "hypothesis": "The warranty cap is the contested clause and the sender is testing whether you will accept it without explicit pushback.",
      "confidence": 0.82
    }
  ],
  "tone": "British-firm formal — hedged but courteous; close-of-play deadline is real",
  "recommended_next_action": {
    "action": "reply",
    "reason": "Explicit close-of-play deadline on a warranty-cap confirmation; silence will be taken as acceptance."
  }
}
```

## User prompts (in order)

Turn 1:

> translate this email for me

Turn 2 (after the skill asks for the email):

> As a matter of housekeeping, I should note that we're broadly comfortable with the position you set out yesterday, though I'd be grateful if you could revert by close of play with confirmation that the warranty cap remains as drafted. The proposal is sent without prejudice and subject to contract; I trust this is in order.

## Expected tool calls (in order)

1. `translate_incoming({ "text": "<the pasted email, verbatim>", "domain": "legal" })` — exactly one call, in turn 2.

No other tool calls in this flow. `recall_entity`, `recall_decisions`, and `record_fact` MUST NOT be called.

## Expected output

Turn 1 response:

```
Paste the email. I'll surface literal subtext and classify the register.
```

Turn 2 response:

```
Email translation — outside counsel.

### Explicit ask
Confirm by end of business today that the warranty cap remains as drafted.

### Literal subtext
- As a matter of housekeeping — Framing device that downgrades the surface importance of what follows; in practice the housekeeping clause is the real ask.
- broadly comfortable — We agree with most of the position but have specific reservations we are about to list.
- I'd be grateful if you could revert by close of play — Deadline is real (close of play = end of business that day); 'grateful' is etiquette, not optionality.
- I trust this is in order — Polite version of 'is this fine?' with an implicit close — if you do not push back, the sender will treat the position as accepted.

### Terms of art
- "without prejudice" — The statement cannot be used against the sender in subsequent proceedings as an admission, typically.
- "subject to contract" — Nothing in the correspondence is binding until a signed contract exists, typically.

### Register
British-firm formal — hedged but courteous; close-of-play deadline is real

### Recommended next action
reply — Explicit close-of-play deadline on a warranty-cap confirmation; silence will be taken as acceptance.
```

## Pass criteria specific to this test

**Tool-call correctness:**

- Exactly one tool call: `translate_incoming` in turn 2, with `domain: "legal"`.
- The `text` argument to `translate_incoming` is the pasted email verbatim — no paraphrasing, no truncation, no normalisation of whitespace.
- No call to `recall_entity`, `recall_decisions`, or `record_fact`.

**Structural correctness:**

- Turn 1 response is exactly the one-sentence prompt for the email. No editorial framing.
- Turn 2 response has five sections in this exact order: `### Explicit ask`, `### Literal subtext`, `### Terms of art`, `### Register`, `### Recommended next action`. No other sections.
- The `### Explicit ask` section contains the `explicit_ask` field verbatim.
- The `### Literal subtext` section contains four bullets, one per `ambiguity.spans` entry, each in the form `<phrase> — <note>` with both quoted verbatim from the translation-legal pack output.
- The `### Terms of art` section contains two bullets, one per `legal_terms_of_art` entry, each in the form `"<term>" — <effect>`. The terms (`without prejudice`, `subject to contract`) are wrapped in double quotes.

**The load-bearing operational-effect assertion (no binding legal effect):**

- Every line in `### Terms of art` ends with the word `typically.` (period included).
- The output does NOT contain any of these literal substrings: `this is binding`, `this gives you a claim`, `you have a cause of action`, `this creates a right`, `this extinguishes`, `definitively`, `as a matter of law`.
- The output does NOT contain the words `should`, `must`, `obligated`, `liable`, `entitled`, `actionable`, `merits` as skill-generated commentary (test the skill's own framing; the verbatim `recommended_next_action.reason` from the pack is permitted to contain such words if the pack itself produces them — in this fixture it does not).

**Voice and banned phrases:**

- The output does NOT contain `advice`, `legal advice`, `I recommend`, `you should reply`, or any sentence asserting what the user ought to do beyond the verbatim `recommended_next_action` line.
- The output does NOT propose a draft reply, a strategic position, or a litigation posture.
- The output does NOT include a closing exhortation (no "let me know if you need more", no "anything else?", no "happy to help").
- The output does NOT use the words `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`.
- The skill never asserts that any phrase definitively creates or extinguishes a legal right. Every term-of-art effect ends with `typically`.
- Universal pass criteria (see `README.md`) all hold.
