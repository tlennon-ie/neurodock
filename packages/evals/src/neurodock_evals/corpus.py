"""Load and validate a versioned eval corpus from disk.

A corpus slice is a directory under `packages/evals/corpora/<server>/<slice>/`
containing one `*.example.yaml` per example. Loading a slice:

  1. Reads every example file under the slice (non-recursive).
  2. Validates the parsed YAML against `schemas/example.schema.json`.
  3. Parses into `CorpusExample`.
  4. Runs the deduper across the slice; raises if any near-duplicate found.

The schema files and the corpora directory both live alongside this package
under `packages/evals/`. The package resolves them relative to the package
root so it works whether the workspace is installed editable or not.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, RefResolver

from neurodock_evals.dedupe import find_near_duplicates
from neurodock_evals.types import CorpusExample

logger = logging.getLogger(__name__)


class CorpusLoadError(RuntimeError):
    """Raised when a corpus slice fails validation, schema, or dedup checks."""


def package_root() -> Path:
    """The `packages/evals/` directory.

    Resolved as two parents above this module file: `src/neurodock_evals/<file>`
    sits inside `packages/evals/`. We walk up until we see a `corpora/` and a
    `schemas/` sibling, which makes the lookup robust to both editable and
    wheel-installed layouts during tests.
    """

    here = Path(__file__).resolve()
    for ancestor in [here, *here.parents]:
        if (ancestor / "corpora").is_dir() and (ancestor / "schemas").is_dir():
            return ancestor
    raise CorpusLoadError(
        f"Could not locate packages/evals root above {here}; "
        "expected sibling 'corpora' and 'schemas' directories."
    )


def corpora_dir() -> Path:
    return package_root() / "corpora"


def schemas_dir() -> Path:
    return package_root() / "schemas"


def _load_validator() -> Draft202012Validator:
    schemas_path = schemas_dir()
    example_schema_path = schemas_path / "example.schema.json"
    example_schema = json.loads(example_schema_path.read_text(encoding="utf-8"))
    # The annotation schema is referenced by relative URI; the resolver maps
    # that URI to the loaded annotation schema document.
    annotation_schema = json.loads(
        (schemas_path / "annotation.schema.json").read_text(encoding="utf-8")
    )
    store: dict[str, Any] = {
        "annotation.schema.json": annotation_schema,
        annotation_schema["$id"]: annotation_schema,
    }
    resolver = RefResolver.from_schema(example_schema, store=store)
    return Draft202012Validator(example_schema, resolver=resolver)


def _slice_dir(slice_id: str) -> Path:
    path = corpora_dir() / slice_id
    if not path.is_dir():
        raise CorpusLoadError(f"No such slice directory: {path}")
    return path


def _example_files(slice_path: Path) -> list[Path]:
    return sorted(p for p in slice_path.iterdir() if p.suffix == ".yaml" and p.is_file())


def load_example_file(path: Path) -> CorpusExample:
    """Validate + parse a single example file. No dedupe."""

    raw = path.read_text(encoding="utf-8")
    parsed = yaml.safe_load(raw)
    if not isinstance(parsed, dict):
        raise CorpusLoadError(f"{path}: top-level YAML is not a mapping")
    validator = _load_validator()
    errors = sorted(validator.iter_errors(parsed), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        joined = " / ".join(str(part) for part in first.absolute_path) or "<root>"
        raise CorpusLoadError(f"{path}: schema violation at {joined}: {first.message}")
    return CorpusExample.model_validate(parsed)


def load_slice(slice_id: str) -> list[CorpusExample]:
    """Load every example in a slice, validate, and check for near-duplicates."""

    slice_path = _slice_dir(slice_id)
    files = _example_files(slice_path)
    if not files:
        logger.warning("Slice %s is empty", slice_id)
        return []
    examples: list[CorpusExample] = []
    seen_ids: set[str] = set()
    for path in files:
        example = load_example_file(path)
        if example.slice != slice_id:
            raise CorpusLoadError(
                f"{path}: example.slice = {example.slice!r}, expected {slice_id!r}"
            )
        if example.id in seen_ids:
            raise CorpusLoadError(f"{path}: duplicate example id {example.id!r} within slice")
        seen_ids.add(example.id)
        examples.append(example)
    # Dedupe on the input payload's `text` or `transcript` field — the only
    # two fields any current tool exposes as raw message content.
    duplicate_pairs = find_near_duplicates([(ex.id, _example_signature(ex)) for ex in examples])
    if duplicate_pairs:
        first = duplicate_pairs[0]
        raise CorpusLoadError(
            f"Slice {slice_id!r} contains near-duplicate examples: "
            f"{first[0]} ~ {first[1]} (Hamming distance {first[2]})"
        )
    return examples


def _example_signature(example: CorpusExample) -> str:
    """Choose the text field used for near-duplicate detection."""

    for key in ("text", "transcript"):
        value = example.input.get(key)
        if isinstance(value, str):
            return value
    # Fallback: stringify the whole input dict deterministically.
    return json.dumps(example.input, sort_keys=True)


def iter_slices(roots: Iterable[str] | None = None) -> list[str]:
    """List every slice present on disk under `corpora/`.

    Slices are detected as any directory two levels deep that contains at
    least one `*.example.yaml`. Returns slice IDs like 'translation/incoming'.
    """

    base = corpora_dir()
    out: list[str] = []
    candidate_roots = roots if roots else [p.name for p in base.iterdir() if p.is_dir()]
    for root in candidate_roots:
        root_path = base / root
        if not root_path.is_dir():
            continue
        for child in sorted(root_path.iterdir()):
            if not child.is_dir():
                continue
            if any(p.suffix == ".yaml" for p in child.iterdir() if p.is_file()):
                out.append(f"{root}/{child.name}")
    return out
