# Ethics

This document governs the clinical guardrail layer of NeuroDock — the
detectors that sit between an LLM and a neurodivergent user. It states what
the project will and will not do.

## Five commitments

These commitments bind every contributor working on guardrail code,
heuristics, or user-facing copy.

### 1. We do not claim to treat any condition

NeuroDock is software. It is not therapy, not a medical device, and not a
diagnostic tool. We never describe a feature as treating, curing, managing,
or remediating a clinical condition.

### 2. We do not block a user silently

Every guardrail action is surfaced to the user with a plain reason. If a
detector fires, the response says so and names the heuristic. The user
keeps a configurable override for every guardrail, set at install time and
changeable at any time without justification.

### 3. Detection heuristics are public and auditable

Every detector ships with its rule set, thresholds, and source code in the
open. We do not run hidden models for guardrail decisions. A user re-running
into a guardrail can read exactly what the heuristic counted and why it
fired.

### 4. We do not aggregate detection events

This commitment is absolute and is not affected by any hosted option. We do
not phone home, we do not build population statistics from real users, and we
do not publish dashboards of detector activity. Detection events are never
pooled across users — not in the local install, and not in any hosted mode.

Guardrail firings stay on the user's machine by default. A user may opt in to
hosted state (see "On data" below), in which case that user's own data is
stored for that user alone — isolated per identity, encrypted at rest, and
deletable by them. Even then, nothing is aggregated: one user's events are
never combined with another's. Local-first remains the default.

### 5. False positives are defects

A guardrail that fires when it should not have fired is a bug, not a
feature. We log user-reported false positives, review them, and adjust
thresholds or heuristics in response. The adjustment trail is public in
the changelog and the relevant ADR.

## On data

NeuroDock is local-first by default. No telemetry runs; no detection event
and no personal data leaves the user's machine without an explicit per-scope
consent action. Heuristics, thresholds, and rule sets are part of the source
tree — not hidden weights and not server-side configuration.

Hosted state is strictly opt-in (a forthcoming option; the default is, and
remains, local). A user who wants the full tool suite without a local install
may opt in to hosted stateful tools (cognitive graph, session state, profile),
and chooses where that state lives:

- Hosted per-user storage — isolated per user identity, encrypted at rest,
  and deletable by the user at any time.
- Bring-your-own-storage — the user supplies their own database; NeuroDock
  stores nothing.

Neither mode changes principle 4: hosted state is per-user and is never
aggregated across users. Opting in requires explicit, informed consent that
states what is stored, where, and how to delete it. The default — and the
recommended path — remains local-first, with data on the user's device.

## On self-identification

The user is the authority on their own neurotype. Self-identification is
sufficient — we never ask for diagnosis, and we do not gate features on
clinical credentials. A user who edits their `~/.neurodock/profile.yaml` to
declare a neurotype activates the relevant skills and detectors; that is
the entire consent mechanism.

## On the limits of the project

NeuroDock is a tool. It is not a substitute for clinical care, not a
substitute for workplace accommodations, and not a productivity-maximisation
system. The guardrails exist to keep the LLM from amplifying patterns that
harm neurodivergent users. Every guardrail is configurable and overridable
by the user it serves. If a user disables a guardrail, that is their
decision to make, and the project respects it.
