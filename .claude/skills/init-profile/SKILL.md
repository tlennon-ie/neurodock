---
name: init-profile
description: Scaffold a fresh ~/.neurodock/profile.yaml from one of the ND-aware presets under profiles/. Use on first install or when starting a new device.
---

# init-profile

Copies one of the curated presets in `profiles/` into the user's
`~/.neurodock/profile.yaml`, with safeguards against overwriting an
existing profile and a follow-up `validate-profile` invocation.

Available presets (see `profiles/README.md`):

- `profiles/adhd.yaml`
- `profiles/audhd.yaml`
- `profiles/burnout-recovery.yaml`
- `profiles/dyslexic.yaml`
- `profiles/dyspraxia.yaml`
- `profiles/educator-semester.yaml`
- `profiles/low-stimulation.yaml`
- `profiles/ocd.yaml`
- `profiles/student-university.yaml`
- `profiles/profile.minimal.yaml` (no neurotype-specific defaults)

Design rationale: `docs/decisions/0004-profile-schema-design.md` — every
preset embodies "lived-experience-led defaults" rather than starting from
an empty file.

## When to use

- First-time setup on a new device.
- Resetting a profile that has drifted into an unreadable state.
- Trying a different preset (e.g. switching from `adhd` to `audhd` after a
  diagnostic update).

## What it does

1. Resolves the target path: `NEURODOCK_PROFILE` env var, else
   `~/.neurodock/profile.yaml`.
2. If a profile already exists at the target, refuses to overwrite unless
   `--force` is passed. With `--force`, copies the prior file to
   `~/.neurodock/profile.yaml.bak.<timestamp>` first.
3. Copies the chosen preset verbatim, then runs `profile validate` against
   the new file as a self-check.
4. Prints the resolved path and a one-line confirmation of which preset was
   used.

## How to invoke

```bash
pnpm --filter @neurodock/cli run --silent dev profile init --preset adhd
```

Force overwrite (with backup):

```bash
pnpm --filter @neurodock/cli run --silent dev profile init --preset audhd --force
```

Custom destination:

```bash
pnpm --filter @neurodock/cli run --silent dev profile init --preset ocd --path ./my-profile.yaml
```

## Output format

```
preset: profiles/adhd.yaml
target: ~/.neurodock/profile.yaml
backup: ~/.neurodock/profile.yaml.bak.20260523T091422  (only with --force)
validate: ok
```

Exit 0 on success, 1 if the target exists and `--force` was not passed, 2
if validation failed against the freshly copied preset (treat as a bug in
the preset itself).

## Limitations

- The `profile init` subcommand is **not yet present** in
  `packages/cli/src/commands/profile.ts` at time of writing. Until it lands,
  manually copy with `cp profiles/<preset>.yaml ~/.neurodock/profile.yaml`
  and then run the `validate-profile` skill. Track this as a CLI gap.
- Presets are snapshots, not live links. Editing a preset after init does
  not update the user's profile.
- No prompting / interactive picker — pass `--preset` explicitly.

## Voice

Treat the install as a quiet operation. A noisy welcome banner is the
opposite of what an ND user needs at minute zero with a new tool. One line
in, one line out.
