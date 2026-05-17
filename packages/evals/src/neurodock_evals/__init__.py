"""NeuroDock eval harness — v0.0.1.

Public surface:

  - :func:`load_slice` — load + validate every example in a corpus slice.
  - :func:`run_example` — exercise one tool's deterministic baseline against one example.
  - :func:`compare_expected` — partial-match scorer.
  - :func:`fingerprint` / :func:`find_near_duplicates` — SimHash deduper.
  - :func:`anonymise_text` / :func:`anonymise_example_payload` — contributor safety net.

The CLI lives in :mod:`neurodock_evals.harness`.
"""

from neurodock_evals.anonymise import (
    ANONYMISATION_PASS_VERSION,
    anonymise_example_payload,
    anonymise_text,
)
from neurodock_evals.corpus import load_example_file, load_slice
from neurodock_evals.dedupe import (
    NEAR_DUPLICATE_THRESHOLD,
    find_near_duplicates,
    fingerprint,
    hamming_distance,
)
from neurodock_evals.runner import DEFAULT_PASS_THRESHOLD, run_example
from neurodock_evals.scoring import cohens_kappa, compare_expected
from neurodock_evals.types import (
    ConsentBlock,
    CorpusExample,
    FieldDelta,
    RaterAnnotation,
    RunResult,
    ScoreReport,
    SliceScore,
)

__version__ = "0.0.1"

__all__ = [
    "ANONYMISATION_PASS_VERSION",
    "DEFAULT_PASS_THRESHOLD",
    "NEAR_DUPLICATE_THRESHOLD",
    "ConsentBlock",
    "CorpusExample",
    "FieldDelta",
    "RaterAnnotation",
    "RunResult",
    "ScoreReport",
    "SliceScore",
    "__version__",
    "anonymise_example_payload",
    "anonymise_text",
    "cohens_kappa",
    "compare_expected",
    "find_near_duplicates",
    "fingerprint",
    "hamming_distance",
    "load_example_file",
    "load_slice",
    "run_example",
]
