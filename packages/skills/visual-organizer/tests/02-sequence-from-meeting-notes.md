# Test 02 — sequence diagram from meeting notes

## Profile

```yaml
preferences:
  motion: "normal"
```

## Trigger

User pastes the transcript and says: "draw this out"

## Input

> **Meeting: Q3 onboarding flow review** (PM, Designer, Engineer present)
>
> PM: I want to confirm scope for the new onboarding flow. Designer, can you walk us through the latest prototype?
> Designer: I shared a Figma link yesterday with three screens — welcome, profile setup, and the first-use checklist.
> Engineer: I reviewed it. The profile setup screen has a field for "team size" that we don't have an API for yet. I'd need a backend change.
> PM: How long for the backend change?
> Engineer: Roughly two days, plus a day for tests.
> Designer: I can drop the field if it saves cycles — we can add it in v2.
> PM: Let's drop it. Designer, please update the Figma. Engineer, please confirm the remaining screens are buildable as-is.
> Engineer: Confirmed, they're buildable. I'll have a branch up by Thursday.
> PM: Great. I'll send a summary to the wider team this afternoon.

## Expected output shape

```
<one sentence describing the diagram>

```mermaid
%%{init: {'theme':'neutral'}}%%
sequenceDiagram
  participant PM
  participant Designer
  participant Engineer
  PM->>Designer: Walk us through the prototype
  Designer->>PM: Three screens shared in Figma
  Engineer->>PM: Profile setup needs new backend field
  PM->>Engineer: How long?
  Engineer->>PM: Two days + one for tests
  Designer->>PM: I can drop the field for v2
  PM->>Designer: Drop it; update Figma
  PM->>Engineer: Confirm remaining screens buildable
  Engineer->>PM: Confirmed; branch by Thursday
  PM->>PM: Send summary to wider team
```

_Accessible description: A sequence between PM, Designer, and Engineer agreeing to drop a team-size field from the onboarding flow, with the Engineer committing to a branch by Thursday and the PM to a team summary._
```

## Pass criteria

- Diagram type is `sequenceDiagram`.
- Exactly three named participants: `PM`, `Designer`, `Engineer` (order flexible, names exact).
- At least five labelled arrows between participants.
- Each arrow label is a paraphrase, not raw transcript quotation longer than ~8 words.
- Neutral theme directive present.
- Accessible description present, 20–200 chars.
- Node/arrow total ≤ 25.
