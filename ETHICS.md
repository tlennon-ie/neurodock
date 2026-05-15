# Ethics

This document governs the clinical guardrail layer of NeuroDock — Area 3 in `plan.md`. It states what we will and will not do when our software sits between an LLM and a neurodivergent user.

## Five commitments

These commitments bind the council and every contributor working on guardrail code, heuristics, or copy. Changes to this list require consensus of the council and consultation with the clinical advisory board (see `GOVERNANCE.md`).

### 1. We do not claim to treat any condition

NeuroDock is software. It is not therapy, not a medical device, and not a diagnostic tool. We never describe a feature as treating, curing, managing, or remediating a clinical condition, and we do not allow third-party plugins distributed through official channels to make those claims either.

### 2. We do not block a user silently

Every guardrail action is surfaced to the user with a plain reason. If a detector fires, the response says so and names the heuristic. The user keeps a configured override for every guardrail, set at install time and changeable at any time without justification.

### 3. Detection heuristics are public and auditable

Every detector ships with its rule set, thresholds, and source code in the open. We do not run hidden models for guardrail decisions. A user re-validating the same decision can read exactly what the rumination detector counted and why it fired.

### 4. We do not aggregate detection events

Guardrail firings stay on the user's machine. We do not phone home, we do not build population statistics from real users, and we do not publish dashboards of how often anyone's detectors trip. Eval corpora used to tune detectors are opt-in, anonymised, and versioned in the open.

### 5. False positives are sometimes harmful, and we take them seriously

A guardrail that fires when it should not have fired is a defect, not a feature. We log false positives the user reports, review them with the clinical advisory board on a quarterly cycle, and adjust thresholds or heuristics in response. We publish the adjustment trail.

## On data

NeuroDock is local-first by design. No telemetry runs by default; no detection event leaves the user's machine without an explicit per-scope consent action. Eval corpora that train or tune detectors are opt-in, anonymised before submission, and versioned publicly in the project's dataset repository. Heuristics, thresholds, and rule sets are part of the source tree — not hidden weights and not server-side configuration. A user who wants to audit a guardrail can read the code that produced its decision.

## On lived experience and review authority

Reviewers with the relevant neurotype have final say on artefacts targeted at that neurotype. Self-identification is sufficient — we do not ask for diagnosis. The maintainer council and the clinical advisory board are separate bodies: the council decides; the advisory advises. The advisory is consulted on every change to guardrail heuristics, every adjustment to thresholds, and every release of new detector logic. Their input is recorded in the pull request; their input does not override the council, and the council does not override the principle that lived experience leads on neurotype-specific artefacts.

## On the limits of the project

NeuroDock is a tool. It is not a substitute for clinical care, not a substitute for workplace accommodations, and not a productivity-maximisation system. The guardrails exist to keep the LLM from amplifying patterns that harm neurodivergent users — they do not exist to optimise output, increase throughput, or measure performance. Every guardrail is configurable and overridable by the user it serves. If a user disables a guardrail, that is their decision to make, and we respect it.

## Alignment with the master plan

This document operationalises Section 8 of `plan.md`. Changes to the plan that touch the guardrail framework, the clinical advisory model, or the data posture must update this file in the same pull request.
