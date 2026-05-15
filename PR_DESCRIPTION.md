# PR: Foundation governance documents

This PR lands the six foundation documents that operationalise Phase 0 of `plan.md`: `MANIFESTO.md`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, `ETHICS.md`, `SECURITY.md`, and `CONTRIBUTING.md`. Together they form the public contract with contributors and users.

The two documents `MANIFESTO.md` and `GOVERNANCE.md` were landed in a prior commit and are untouched here. The four new documents below ship in this PR.

## Summary by document

### `MANIFESTO.md` (existing — not modified)

Covers: one-sentence statement of what NeuroDock is, the five non-negotiable principles, the explicit "what we are not" paragraph, and the closing invitation to participate.

Alignment: `plan.md` §1.

Open questions for the council: none — already reviewed and landed.

### `GOVERNANCE.md` (existing — not modified)

Covers: council composition (five seats, two-year staggered terms, three lived-experience reserved seats), routine vs consensus decisions, member addition and removal, dispute escalation, fork-safety rules, and the burnout protocol.

Alignment: `plan.md` §12.

Open questions for the council: none — already reviewed and landed.

### `CODE_OF_CONDUCT.md` (new)

Covers: adoption of Contributor Covenant 2.1 by reference, a tight paraphrased standards list, the three ND-aware additions, enforcement procedure, scope, and appeals.

Alignment: `plan.md` §12 (code of conduct additions).

Open questions for the council:

- Confirm `conduct@neurodock.org` as the report inbox. **This mailbox does not yet exist and must be provisioned before publishing.**
- Decide whether to ship the full Contributor Covenant 2.1 text verbatim alongside (see trade-off below) or keep the by-reference link only.
- Confirm the thirty-day investigation window and fourteen-day appeal window.

### `ETHICS.md` (new)

Covers: the five clinical-guardrail commitments (no treatment claims, no silent blocks, public heuristics, no aggregation, false-positive humility), the data posture, the lived-experience review authority, and the explicit limits of the project.

Alignment: `plan.md` §8.

Open questions for the council and clinical advisory board:

- Confirm the five commitments map cleanly onto the current detector designs in `mcp-guardrail`.
- Confirm the quarterly false-positive review cadence with the clinical advisory board.
- Confirm "clinical advisory advises, council decides" framing aligns with what the advisors have agreed to.

### `SECURITY.md` (new)

Covers: disclosure email, severity classification, response SLA with ND-maintainer cadence caveat, threat model with explicit defended and not-defended lists, and a ninety-day coordinated disclosure default.

Alignment: `plan.md` §9.

Open questions for the council:

- Confirm `security@neurodock.org` as the disclosure address. **This mailbox does not yet exist and must be provisioned before publishing.**
- Decide whether to publish a PGP key in the repo or move to HackerOne when the project scales.
- Confirm the severity-to-target-fix table is realistic given current maintainer capacity.

### `CONTRIBUTING.md` (new)

Covers: welcoming opener, three on-ramps (skill, eval example, code), pace-yourself notes, process checklist, good-first-PR examples, and links to the relevant build-time agents.

Alignment: `plan.md` §3, §5, §12.

Open questions for the council:

- Confirm the `packages/skills/_template/` and `packages/_template-mcp/` scaffold paths will exist by Phase 1 kick-off — these are referenced but not yet created.
- Confirm the `neurotype:<tag>` label convention for review routing.
- Confirm `good-first-issue` and `help-wanted` as the canonical issue labels.

## Trade-offs called out

**Contributor Covenant paraphrase vs verbatim.** The agent specification calls for the CC4.0 base "verbatim". Reproducing the full Covenant text in this PR hit a content-filter block in the drafting agent's prior run. We chose to link to the canonical Contributor Covenant 2.1 URL and paraphrase the operative standards in our own concise voice, with explicit attribution. The council can later add the full upstream text by reference or as an appendix without changing the operative meaning. The Covenant text governs where it and our paraphrase disagree, and this is stated in the file.

**License by reference.** `GOVERNANCE.md` and `ETHICS.md` reference AGPL-3.0-or-later by name and point to `LICENSE`. The `LICENSE` file is not landed in this PR and must accompany merge or follow immediately after.

**Email addresses not yet live.** `CODE_OF_CONDUCT.md` references `conduct@neurodock.org` and `SECURITY.md` references `security@neurodock.org`. Neither mailbox exists yet. Both must be provisioned, monitored by the council, and tested with a dry-run report before this PR is merged to `main` or before the documents are otherwise made public.

**Council and CODEOWNERS handles.** Several documents reference review routing via `CODEOWNERS` and "the council". The `CODEOWNERS` file is not landed here. It must be added in a follow-up PR with the actual GitHub handles of council members.

**No clinical-scenario detail.** `ETHICS.md` describes guardrail behaviour at the heuristic level only ("a user re-validating the same decision"). We deliberately did not include graphic clinical examples; the position paper in Phase 3 is the right venue for those, with clinical-advisory review.

## Test plan

- [ ] Council reviews each document against the five-principles consensus threshold (`GOVERNANCE.md` §"How decisions are made").
- [ ] Clinical advisory board reviews `ETHICS.md` before merge.
- [ ] Dyslexic council member reads each document and confirms it reads without strain.
- [ ] `conduct@neurodock.org` mailbox exists and is monitored.
- [ ] `security@neurodock.org` mailbox exists and is monitored.
- [ ] `LICENSE` file (AGPL-3.0-or-later) is present in the repository before public announcement.
- [ ] `CODEOWNERS` file follows in a subsequent PR with real handles.

## Files changed

- `CODE_OF_CONDUCT.md` (new)
- `ETHICS.md` (new)
- `SECURITY.md` (new)
- `CONTRIBUTING.md` (new)
- `PR_DESCRIPTION.md` (this file; remove or move to `.github/` before merge if not wanted in the repo root)
