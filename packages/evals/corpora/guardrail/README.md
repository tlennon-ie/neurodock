# guardrail/

Reserved for the clinical-reviewer field study. v0.0.1 ships no examples
here. The guardrail corpus is owned by a separate, more sensitive harness
under a stricter consent process than the translation corpus; see
`ETHICS.md` and the clinical-reviewer agent for the policy.

The plan:

- **Phase 2** (months 4-6): clinical-reviewer + council scope the schema for
  guardrail evals (overload/escalation triggers, false-positive cost, etc.).
- **Phase 3** (months 7-12): pilot with a small ND research cohort; ratings
  go through a separate IRB-equivalent review before merging.
- **Phase 4**: integration with the main harness behind a `--guardrail` flag
  that keeps the corpus in a separate report stream.
