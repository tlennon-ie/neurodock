# NeuroDock skills

The skill library. Each skill lives in its own directory and ships a `SKILL.md` with standard frontmatter, plus a `tests/` directory with at least three example invocations replayed in CI.

This directory is intentionally not a workspace package — skills are content, not code. They are bundled into the substrate at install time via `@neurodock/cli`.

Phase 0: stub frontmatter for the six launch skills only. Real prompts and tests land in Phase 1 and Phase 2.

Launch skills (see  Section 6):

- `adhd-daily-planner` — Morning ritual, generates 1–3 things that matter today.
- `audhd-context-recovery` — `/resume` command; reconstructs yesterday from the cognitive graph.
- `asd-meeting-translator` — Transcript to structured asks. Depends on the translation server (Phase 2).
- `ocd-decision-finalizer` — Enforces decision-finality on repeat validation.
- `hyperfocus-formatter` — "Answer First" output structure under distress signals.
- `visual-organizer` — Mermaid generation for overwhelm states.

Authoring a new skill: fork, copy an existing `SKILL.md`, fill in the frontmatter, add three test invocations to `tests/`, open a PR.
