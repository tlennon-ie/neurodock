---
name: validate-profile
description: Validate a profile.yaml against the canonical schema and surface structured errors. Run before editing the profile by hand, before sync, and before reporting a profile-related bug.
---

# validate-profile

Wraps the CLI's profile validator so a contributor can check
`~/.neurodock/profile.yaml` (or any other path) against the canonical
schema at `packages/core/schemas/profile.schema.json` and see field-by-field
errors instead of generic YAML noise.

Authoritative inputs:

- Schema: `packages/core/schemas/profile.schema.json`
- Reference profile shape: `packages/cli/src/types.ts` (`ProfileV01`)
- Design rationale: `docs/decisions/0004-profile-schema-design.md`

## When to use

- Before hand-editing `~/.neurodock/profile.yaml`.
- Before `nd profile sync` so a malformed profile is caught locally.
- When a skill or MCP server reports "profile field X is missing" and you
  want to see all the other things that are wrong in one pass.
- When reviewing a PR that touches `packages/core/schemas/profile.schema.json`.

## What it does

1. Resolves the profile path: `--path <file>` argument, else
   `NEURODOCK_PROFILE` env var, else `~/.neurodock/profile.yaml`.
2. Loads the YAML, parses it, and validates against
   `packages/core/schemas/profile.schema.json`.
3. Prints each violation as `path.to.field: <message>` on its own line.
4. Exits non-zero on any violation so the skill can be chained in pre-commit
   hooks or CI.

## How to invoke

From the repo root:

```bash
pnpm --filter @neurodock/cli run --silent dev profile validate
```

Validate a specific file:

```bash
pnpm --filter @neurodock/cli run --silent dev profile validate --path ./profiles/adhd.yaml
```

CI / scripting (JSON output):

```bash
pnpm --filter @neurodock/cli run --silent dev profile validate --format json
```

## Output format

Default human format:

```
profile: ~/.neurodock/profile.yaml
schema: packages/core/schemas/profile.schema.json (v0.1.0)

preferences.max_chunk_size: must be <= 9 (got 12)
guardrails.rumination_window_minutes: must be integer (got "ninety")
neurotypes: at least one of [adhd, asd, ocd, audhd, dyslexic, none] required

3 violations
```

Exit 0 on clean, 1 on any violation.

## Limitations

- Does not migrate older profile shapes — it only validates v0.1.0.
- Does not check whether referenced files exist (e.g. font hints, plugin paths).
- Does not check semantic sanity (e.g. `work_hours.start > work_hours.end` is
  caught by the schema's `oneOf`, but timezone correctness is not).
- The `profile validate` subcommand is present under
  `packages/cli/src/commands/profile.ts`; if it errors with "unknown command",
  rebuild the CLI with `pnpm --filter @neurodock/cli build` first.

## Voice

Lead with the first violating field; no preamble. The output is read by a
contributor who is already debugging — they want to see what's wrong, not
hear that "validation completed successfully" 14 times. Stay quiet on clean
runs.
