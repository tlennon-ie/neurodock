# Contributing to the NeuroDock eval corpus

Thank you for considering a contribution. The corpus is what makes the
translation layer honest — every example you donate helps us prove that an
ND-aware prompt actually helps ND users, and helps us catch regressions when
prompts change.

Read this entire document before submitting. We reject contributions that
skip it.

## What we accept

- **Anonymised excerpts** of messages you yourself sent or received.
- **Examples where you have explicit opt-in consent** from every named party,
  with a written attestation you can produce on request.
- **Self-rated examples**: you (the ND contributor) describe what the message
  literally meant, what you read as subtext, what was ambiguous, and what
  next action you would take. Three independent raters per example is the
  steady-state target; one is the floor.
- Examples in **any natural language we have a prompt template for**
  (currently English; others to follow).

## What we reject — without exception

- Anything that contains real personal data the contributor hasn't already
  anonymised. The anonymiser script (`anonymise.py`) is a **safety net**, not
  a substitute for human judgement.
- Anything sourced from a public channel (a public Slack workspace, a public
  GitHub issue) **without the original speaker's consent**. "It was public"
  is not consent.
- Anything scraped, automatically or by hand. Scraping is out of scope; the
  corpus is consented data only.
- Anything containing a stack trace, log line, or code block whose contents
  the contributor cannot vouch for as redactable.
- Anything from a current employer where the contributor cannot demonstrate
  authority to share. When in doubt, escalate to the council before the PR.

## The contribution flow

1. **Fork** the repository.
2. Copy a seed example as a template:
   ```bash
   cp packages/evals/corpora/translation/incoming/001-circle-back.example.yaml \
      packages/evals/corpora/translation/incoming/099-my-example.example.yaml
   ```
3. **Fill in your example** in the new file. Use a freshly generated `id`
   (slug-based is fine; uniqueness within the slice is required).
4. Set `status: "contributed"` (NOT `"synthesised"` — that label is reserved
   for the curator's seed set).
5. Run the **anonymiser**:
   ```bash
   uv run python -m neurodock_evals.anonymise \
       packages/evals/corpora/translation/incoming/099-my-example.example.yaml
   ```
   The script writes a diff to stdout and an `--in-place` flag commits the
   redaction. Review the diff carefully — false positives are preferable, but
   so are false negatives the curator will then catch in review.
6. **Re-read the redacted file**. Confirm you cannot reconstruct the original
   sender, recipient, project, or company from what remains.
7. Open a **PR**. The eval-curator agent reviews every contribution. Expect
   round-trip questions about consent, anonymisation, and rater notes.

## What happens after you open the PR

1. The eval-curator agent runs `anonymise.py` again to confirm idempotence.
2. The harness loads the example and validates it against
   `schemas/example.schema.json`.
3. The deduper checks for near-duplicates (SimHash Hamming distance < 4).
4. The curator reviews for: PII the script missed, ND-realism, rating
   plausibility, and consent provenance.
5. If two more ND-raters are needed to reach the steady-state minimum of
   three, the curator queues the example for the rater rotation.
6. On approval, the example merges. You retain the right to request removal
   at any time — see `ETHICS.md`.

## Consent token

Every contributed example carries a `consent.consent_token`. v0.0.1 uses an
opaque SHA-256 stub; the production contribution pipeline (Phase 2) replaces
this with a signed token from the `evals.neurodock.org/contribute` flow.

Until that pipeline ships, contributors include `consent_token:
"sha256:manual-attestation"` and email a one-paragraph attestation to the
council. The council records the attestation in a private register and the
curator's review of the PR confirms it.

## Licensing

By submitting a contribution you agree to license it under
**AGPL-3.0-or-later**, the same license as the rest of the corpus and the
NeuroDock codebase. This means anyone can audit, fork, and reproduce our
methodology — a non-negotiable part of the trust contract with ND users.

## Withdrawing a contribution

Email the council. We will remove the example from `main`, tag a corpus
release noting the removal, and propagate the removal to any downstream
HuggingFace mirror at the next sync. We do not negotiate timelines on
withdrawal requests.
