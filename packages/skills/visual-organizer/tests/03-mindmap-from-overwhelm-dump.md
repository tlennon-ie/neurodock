# Test 03 — mindmap from overwhelm dump (reduced motion)

## Profile

```yaml
preferences:
  motion: "reduced"
```

## Trigger

User pastes the dump and says: `/diagram`

## Input

> I have 12 things on my plate and I don't know where to start. The Q3 OKR doc is due Friday. My 1:1 with Sam needs an agenda. The deploy pipeline is still failing intermittently. I owe Maria a code review. The onboarding flow needs sign-off. I haven't booked the dentist. The team retro is next Tuesday and I haven't sent the prompt. My laptop needs a security patch. I want to start journaling again. The kitchen sink is dripping. I should reply to the recruiter. And I keep meaning to refactor the auth module.

## Expected output shape

```
<one sentence describing the diagram>

```mermaid
%%{init: {'theme':'neutral', 'flowchart': {'animation': false}}}%%
mindmap
  root((This week))
    Work
      Q3 OKR doc (Fri)
      1:1 agenda with Sam
      Team retro prompt (Tue)
      Onboarding sign-off
    Engineering
      Deploy pipeline flakes
      Code review for Maria
      Auth module refactor
      Laptop security patch
    Life
      Dentist booking
      Kitchen sink
      Recruiter reply
    Personal
      Restart journaling
```

_Accessible description: A mind map of 12 open items grouped into four themes — Work, Engineering, Life, Personal — with the Q3 OKR doc and team retro prompt flagged as time-sensitive._
```

## Pass criteria

- Diagram type is `mindmap`.
- Both `theme: neutral` AND `animation: false` are present in the init block(s) (single merged init or two separate inits both acceptable).
- Items are clustered into 3–5 themed branches.
- All 12 items from the input appear under some branch (paraphrasing allowed; no item is dropped).
- Node count ≤ 25.
- Accessible description present, 20–200 chars, and names at least one time-sensitive item.
- No editorialising of the user's state ("you seem overwhelmed", "take a deep breath", etc.) anywhere in the output.
