# Test 04 — flowchart from "I can't see the structure"

## Profile

```yaml
preferences:
  motion: "normal"
```

## Trigger

User pastes the prose and says: `I can't see the structure of this`

## Input

> Trying to explain our incident response and I keep losing the thread. When an alert fires, PagerDuty pages the on-call engineer. The on-call acks within five minutes — if they don't, it escalates to the secondary. The on-call opens an incident channel in Slack and posts the alert. They triage: is it a real incident or noise? If noise, they close it and tag the alert for tuning. If real, they declare severity (sev1, sev2, sev3). Sev1 pulls in an incident commander and a comms lead automatically. Sev2 pulls in an incident commander only. Sev3 is handled by the on-call solo. Once mitigated, the on-call writes a short timeline in the channel and schedules a postmortem for sev1 and sev2. Sev3 gets a one-line followup ticket instead.

## Expected output shape

````
<one sentence describing the diagram>

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart TD
  alert[Alert fires] --> page[PagerDuty pages on-call]
  page --> ack{Ack within 5m?}
  ack -- no --> secondary[Escalate to secondary]
  ack -- yes --> channel[Open Slack incident channel]
  secondary --> channel
  channel --> triage{Real incident?}
  triage -- noise --> tune[Close + tag for tuning]
  triage -- real --> sev{Declare severity}
  sev -- sev1 --> sev1[IC + comms lead paged]
  sev -- sev2 --> sev2[IC paged]
  sev -- sev3 --> sev3[On-call handles solo]
  sev1 --> mitigate[Mitigate]
  sev2 --> mitigate
  sev3 --> mitigate
  mitigate --> timeline[Post timeline in channel]
  timeline --> followup{Severity?}
  followup -- sev1/sev2 --> postmortem[Schedule postmortem]
  followup -- sev3 --> ticket[One-line followup ticket]
````

_Accessible description: An incident response flow from alert through PagerDuty ack, triage, severity declaration (sev1/sev2/sev3 with different staffing), mitigation, timeline, and either a scheduled postmortem or a followup ticket._

```

## Pass criteria

- Trigger phrase "i can't see the structure" (case-insensitive) successfully activates the skill.
- Diagram type is `flowchart TD`.
- Node count between 10 and 25 inclusive.
- At least three diamond decision nodes (`{...}`) covering ack, triage, severity, and/or followup branching.
- At least four edges carry labels (e.g. `yes`, `no`, `noise`, `real`, `sev1`, `sev2`, `sev3`).
- All three severities (`sev1`, `sev2`, `sev3`) appear as distinct branches.
- Neutral theme directive present.
- `animation: false` is NOT required (profile motion is normal).
- Accessible description present, 20–200 chars.
- No editorialising of the user's state ("sounds stressful", "you've got this", "looks like overload", etc.) anywhere in the output. The user said they can't see the structure — answer with a structure, not sympathy.
```
