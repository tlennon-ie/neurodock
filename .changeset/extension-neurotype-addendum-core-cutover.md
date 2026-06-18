---
"@neurodock/extension-browser": patch
---

read per-neurotype prompt shaping from the shared `@neurodock/core` artifact (r1 part a)

internal refactor with zero behaviour change. `buildNeurotypeAddendum` no
longer hard-codes the per-(tool x neurotype) blocks inline; it now delegates to
`@neurodock/core`'s `assembleNeurotypeAddendum(neurotypeAddendaV1, ...)`, the
single source of truth that the mcp-translation server will also read. the
public signature (`buildNeurotypeAddendum(profile, tool?)`) is unchanged, so
prompt-builder.ts and every existing test are untouched.

the cutover is proven byte-for-byte: a new golden-snapshot test asserts the
output is identical to the previously-shipped hard-coded function across the
full cross-product of all five tools (+ the no-tool overload), every neurotype
combination (single types, the adhd+asd -> audhd fusion, explicit audhd, a 3+
multi-type, and empty), max_chunk_size variants, voice_input_preferred
true/false/unset, output_format variants, and additional_notes present/absent.
adds `@neurodock/core` as a workspace dependency.
