# Governance

NeuroDock is maintained by the project owner and any contributors who land
work in the repo. This document is intentionally short. It defines who
decides what, how disagreements resolve, and how the project can be forked
without ambiguity.

## Who decides

The repository owner is the project maintainer and has final say on merges,
releases, and direction. As contributors land sustained work, the maintainer
may grant them commit access and shared decision-making on areas they own.

There is no committee, no fixed seat count, and no required composition. The
project stays small and direct.

## How decisions are made

Most decisions resolve in the pull request or issue thread between the
maintainer and the contributor. When a decision is non-trivial enough to
need a separate record, it lands as an Architecture Decision Record under
`docs/decisions/` with a numbered identifier and a clear status.

Changes to `MANIFESTO.md`, `ETHICS.md`, or this file are reviewed with the
care they deserve and noted in the changelog. Everything else moves at the
pace the maintainer and contributor agree on.

## Adding maintainers

Sustained contribution earns commit access. Sustained means: multiple landed
PRs, demonstrated alignment with the manifesto, no Code of Conduct issues.
The maintainer extends an invitation; the new maintainer accepts in writing.

## Removing maintainers

A maintainer steps back voluntarily or, in the rare case of a substantiated
Code of Conduct violation, is removed by the project owner with reasons
recorded in the changelog. Inactive maintainers are not removed — silence is
fine.

## Dispute escalation

Most disagreements resolve in the thread they started in. When they don't:

1. The disagreeing parties summarise the question and the trade-offs they
   see in a single comment.
2. The maintainer makes the call and records it.
3. If the disagreement is about the manifesto or ethics, the change is
   refused unless and until the manifesto or ethics document itself is
   updated.

## Forking safely

NeuroDock is licensed AGPL-3.0-or-later (see `LICENSE`). Forking is welcome
and expected.

A fork that wants to keep the NeuroDock name must follow two rules: keep
the manifesto intact, and keep the clinical guardrails framework auditable
and overridable. A fork that drops either renames itself — the name
"NeuroDock" carries those commitments.

A fork that renames is unconstrained beyond the AGPL terms.

## Pacing

Contributors can declare AFK at any time, for any duration, with no
explanation needed. Async by default. Latency in response is normal.
