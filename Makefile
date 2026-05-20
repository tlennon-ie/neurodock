# NeuroDock developer Makefile
#
# Thin convenience wrapper. Every target shells out to the canonical tool
# (uv, pnpm, turbo) so behaviour stays identical between local + CI.
#
# Usage:
#     make                # prints this help
#     make bootstrap      # one-shot first-clone setup
#     make test           # run the full test suite (python + ts)
#
# This file uses tab-indented recipes (POSIX make requirement); editors
# should treat the file as tab-indented (.editorconfig enforces this).

.DEFAULT_GOAL := help

# Workspace globs reused across recipes. Keep in sync with pyproject.toml
# [tool.uv.workspace] members.
PY_PACKAGES := packages/mcp-chronometric \
               packages/mcp-cognitive-graph \
               packages/mcp-task-fractionator \
               packages/mcp-translation \
               packages/mcp-guardrail \
               packages/clinical \
               packages/evals

.PHONY: help bootstrap install test test-python test-node lint lint-python lint-node \
        typecheck typecheck-python typecheck-node build docs-dev format format-check \
        clean clean-python clean-node precommit-install precommit-run

## help: Print this help message
help:
	@echo "NeuroDock developer Makefile"
	@echo ""
	@echo "Common targets:"
	@echo "  make bootstrap        First-clone setup (runs scripts/dev-setup.sh)"
	@echo "  make install          Sync uv + pnpm dependencies"
	@echo "  make test             Run python + typescript tests"
	@echo "  make lint             Run python + typescript linters"
	@echo "  make typecheck        Run mypy --strict + tsc --noEmit"
	@echo "  make build            Build all workspaces via turbo"
	@echo "  make format           Format python + js/ts/md/yaml"
	@echo "  make format-check     Verify formatting without writing"
	@echo "  make docs-dev         Start the Astro Starlight docs server"
	@echo "  make precommit-install   Install the pre-commit git hook"
	@echo "  make precommit-run    Run all pre-commit hooks against the tree"
	@echo "  make clean            Remove generated artifacts"
	@echo ""
	@echo "Granular targets: test-python, test-node, lint-python, lint-node,"
	@echo "                  typecheck-python, typecheck-node, clean-python, clean-node"

## bootstrap: One-shot setup for a fresh clone
bootstrap:
	@if [ -x scripts/dev-setup.sh ]; then \
		scripts/dev-setup.sh; \
	elif [ -f scripts/dev-setup.sh ]; then \
		bash scripts/dev-setup.sh; \
	else \
		echo "scripts/dev-setup.sh not found — falling back to 'make install'"; \
		$(MAKE) install; \
	fi

## install: Sync uv + pnpm dependencies
install:
	uv sync --all-extras --dev
	pnpm install --frozen-lockfile || pnpm install

## test: Run the full test suite
test: test-python test-node

test-python:
	uv run pytest

test-node:
	pnpm turbo run test

## lint: Run all linters
lint: lint-python lint-node

lint-python:
	uv run ruff check .

lint-node:
	pnpm turbo run lint

## typecheck: Run mypy --strict and tsc
typecheck: typecheck-python typecheck-node

typecheck-python:
	uv run mypy --strict $(PY_PACKAGES)

typecheck-node:
	pnpm turbo run typecheck

## build: Build all workspaces
build:
	pnpm turbo run build

## docs-dev: Start the docs dev server
docs-dev:
	pnpm --filter @neurodock/docs run dev

## format: Format the entire tree
format:
	uv run ruff format .
	pnpm run format

## format-check: Verify formatting; fail if anything would change
format-check:
	uv run ruff format --check .
	pnpm run format:check

## precommit-install: Install pre-commit git hooks (commit + commit-msg)
precommit-install:
	pre-commit install
	pre-commit install --hook-type commit-msg

## precommit-run: Run all configured pre-commit hooks against every file
precommit-run:
	pre-commit run --all-files

## clean: Remove generated artifacts (node + python)
clean: clean-python clean-node

clean-python:
	@echo "Cleaning python caches..."
	@find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".mypy_cache" -o -name ".ruff_cache" \) \
		-not -path "*/node_modules/*" -not -path "*/.venv/*" -prune -exec rm -rf {} + 2>/dev/null || true

clean-node:
	@echo "Cleaning node + turbo artifacts..."
	@find . -type d \( -name "node_modules" -o -name "dist" -o -name ".turbo" \) \
		-not -path "*/.venv/*" -prune -exec rm -rf {} + 2>/dev/null || true
