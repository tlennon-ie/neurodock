# scripts/

Repo-wide tooling. Small, single-purpose, runnable on macOS / Linux / Windows
(PowerShell or WSL). If a script grows past ~200 lines or develops branching
logic per platform, it probably belongs in a real package, not here.

## What's here

### `dev-setup.sh`

The "I just cloned, what now" bootstrap. Installs Node + Python dependencies,
runs the workspace build, executes the test suites. Idempotent — safe to re-run
after pulling new commits.

```bash
./scripts/dev-setup.sh
```

Expects `node >= 22`, `pnpm >= 11`, `python >= 3.11`, and `uv` already on PATH.
See the top of the script for the exact preflight check. If you don't have
those, install them first (`README.md` lists the package managers).

## Conventions

- POSIX `bash` with `set -euo pipefail` at the top of every script
- `echo` before each step so a contributor watching the output knows what's
  happening
- No `sudo`, no global installs, no network calls beyond `pnpm install` /
  `uv sync` / `git`
- Exit non-zero on failure; let the caller decide what to do
