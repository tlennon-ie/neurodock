# Governance

NeuroDock is governed by a five-person maintainer council. The council holds decision authority over the project. This document defines how the council is composed, how decisions are made, and how disagreements are resolved.

## The council

The council has five seats. Terms are two years long and staggered, so two or three seats rotate each year. No council member serves more than two consecutive terms; after a one-year gap, a former member is eligible again.

At least three of the five seats are reserved for contributors with lived experience of a relevant neurotype. Self-identification is sufficient — we never ask for diagnosis. The remaining seats are open to any contributor who meets the participation bar.

The council elects a rotating chair every six months. The chair runs meetings and tracks decisions; the chair has no extra vote.

## How decisions are made

Routine decisions pass by simple majority of the council (three of five). Routine includes: technical roadmap, release approval, contributor on-boarding, dispute resolution, and routine policy.

Three changes require full consensus (all five members agreeing, or four with one abstention):

- Edits to `MANIFESTO.md` or the five principles.
- Edits to `ETHICS.md` or the clinical guardrail framework.
- Edits to this file (`GOVERNANCE.md`).

A council member can abstain on any vote without giving a reason. Abstentions count toward quorum but not toward majority or consensus thresholds. Quorum is four members.

Council meetings happen monthly and are minuted publicly in the repository. Async votes between meetings are valid when held open for at least seven calendar days.

## Adding council members

Vacancies open when a term ends, when a member resigns, or when a member is removed. The council posts an open call in the repository and on the project's public channels.

Candidates self-nominate or are nominated by an existing maintainer. The council reviews nominations against three criteria: sustained contribution to the project, alignment with the manifesto, and the seat's lived-experience reservation if it applies. The council selects by simple majority.

A new member's term starts at the next scheduled meeting and runs for two years.

## Removing council members

A council member is removed for one of three reasons: voluntary resignation, sustained inactivity (no engagement for 90 days without an AFK declaration), or a substantiated Code of Conduct violation.

Removal for inactivity or Code of Conduct violation requires a vote of the remaining four members, with at least three in favour. The affected member is notified in writing and has fourteen days to respond before the vote is held. The response is recorded in the meeting minutes.

A removed member can stand for election again after one year.

## Dispute escalation

Most disagreements resolve in the pull request or issue thread. When they do not, the path is:

1. The disagreeing parties bring the question to the next council meeting (or open an async vote).
2. The council decides by the relevant threshold (majority for routine, consensus for manifesto and ethics).
3. If the council deadlocks twice on the same question, the chair calls an external facilitator from the contributor community. The facilitator does not decide; they help the council reach one.
4. If deadlock persists after facilitation, the project freezes the disputed area until the next council rotation brings new perspective.

The clinical advisory board is consulted on disputes touching `ETHICS.md` or guardrail behaviour. The board advises; the council decides.

## Forking safely

NeuroDock is licensed AGPL-3.0-or-later (see `LICENSE`). Forking is welcome and expected. We make forks easy to do well.

A fork that wants to keep the NeuroDock name must follow three rules: keep the manifesto intact, keep lived-experience review authority for neurotype-targeted artefacts, and keep the clinical guardrails framework auditable and overridable. A fork that drops any of these renames itself — the name "NeuroDock" carries those commitments.

A fork that renames is unconstrained beyond the AGPL terms. We will link to renamed forks from the README when they exist and ship.

## Burnout protocol

Council members and maintainers can declare AFK at any time, with no questions asked, for any duration. Their reviews automatically reassign to the next CODEOWNER. Their council vote is recorded as abstention for the duration.

Every package has at least two CODEOWNERS. No solo bus factors. Quarterly retrospectives include an explicit "how is everyone holding up" agenda item.

## Alignment with the master plan

This document operationalises Section 12 of `plan.md`. Changes to the plan that touch governance must update this file in the same pull request.
