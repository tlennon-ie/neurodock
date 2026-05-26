#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
#
# dev-setup.sh — NeuroDock contributor bootstrap.
#
# "I just cloned the repo, what now." Installs JS + Python dependencies,
# builds the workspace, runs the test suites. Idempotent: safe to re-run
# after pulling new commits.
#
# Prerequisites (install yourself first):
#   - node    >= 22  (https://nodejs.org or `nvm install 22`)
#   - pnpm    >= 11  (`npm install -g pnpm`)
#   - python  >= 3.11
#   - uv             (`pip install uv` or `winget install astral-sh.uv`)
#
# Usage:
#   ./scripts/dev-setup.sh
#
# Exits non-zero on the first failing step.

set -euo pipefail

# Resolve repo root regardless of where the script was invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo ""
echo "================================================================"
echo " NeuroDock dev-setup"
echo " repo: ${REPO_ROOT}"
echo "================================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 0 — preflight: required tools on PATH
# ---------------------------------------------------------------------------
echo "[0/5] Checking required tools..."

missing=0
for tool in node pnpm python uv; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "  MISSING: ${tool}"
    missing=1
  else
    echo "  ok:      ${tool}  ($(command -v "${tool}"))"
  fi
done

if [ "${missing}" -ne 0 ]; then
  echo ""
  echo "Install the missing tools and re-run. See the header of this script."
  exit 1
fi
echo ""

# ---------------------------------------------------------------------------
# Step 1 — JS dependencies
# ---------------------------------------------------------------------------
echo "[1/5] Installing JS dependencies (pnpm install --frozen-lockfile)..."
pnpm install --frozen-lockfile
echo "      done."
echo ""

# ---------------------------------------------------------------------------
# Step 2 — Python dependencies
# ---------------------------------------------------------------------------
echo "[2/5] Syncing Python workspace (uv sync --all-packages --all-extras)..."
uv sync --all-packages --all-extras
echo "      done."
echo ""

# ---------------------------------------------------------------------------
# Step 3 — Build the workspace
# ---------------------------------------------------------------------------
echo "[3/5] Building TypeScript packages (pnpm turbo run build)..."
pnpm turbo run build
echo "      done."
echo ""

# ---------------------------------------------------------------------------
# Step 4 — Python tests
# ---------------------------------------------------------------------------
echo "[4/5] Running Python tests (uv run pytest --tb=short -q)..."
uv run pytest --tb=short -q
echo "      done."
echo ""

# ---------------------------------------------------------------------------
# Step 5 — CLI tests
# ---------------------------------------------------------------------------
echo "[5/5] Running CLI tests (pnpm --filter @neurodock/cli run test)..."
pnpm --filter @neurodock/cli run test
echo "      done."
echo ""

echo "================================================================"
echo " dev-setup complete."
echo ""
echo " Next steps:"
echo "   - Read TESTING_LOCAL.md to wire NeuroDock into Claude Desktop"
echo "   - Or read examples/claude-desktop/README.md for the worked example"
echo "   - Pick a 'good first issue' on GitHub if you want to contribute"
echo "================================================================"
