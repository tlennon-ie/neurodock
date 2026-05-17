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

Guardrail firings stay on the user's machine. We do not phone home, we do
not build population statistics from real users, and we do not publish
dashboards of detector activity. Local-first by design.

### 5. False positives are defects

A guardrail that fires when it should not have fired is a bug, not a
feature. We log user-reported false positives, review them, and adjust
thresholds or heuristics in response. The adjustment trail is public in
the changelog and the relevant ADR.

## On data

NeuroDock is local-first. No telemetry runs by default; no detection event
leaves the user's machine without an explicit per-scope consent action.
Heuristics, thresholds, and rule sets are part of the source tree — not
hidden weights and not server-side configuration.

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
