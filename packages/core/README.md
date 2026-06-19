# @neurodock/core

Shared, framework-neutral building blocks for NeuroDock: the profile JSON Schema and
TypeScript types, the plugin protocol schema, and the per-neurotype prompt-shaping
artifact + assembler that every NeuroDock surface uses to tailor output.

This package has zero runtime dependencies. Data lives as JSON (validated by JSON Schema);
the assembler is a pure function.

## Install

```sh
pnpm add @neurodock/core
```

## What's inside

- **Profile types + schema** — `Profile` (and its block interfaces) plus
  `schemas/profile.schema.json`, the cross-cutting user manifest read by every MCP server
  and skill. See [ADR 0004](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0004-profile-schema-design.md).
- **Neurotype-shaping artifact + assembler** — `data/neurotype-addenda/v1.json` is the
  single source of truth for the per-(tool × neurotype) prompt addenda; `assembleNeurotypeAddendum`
  turns it into the addendum string. Both the browser extension and the `mcp-translation`
  server read this artifact so per-neurotype shaping stays identical across surfaces. See
  [ADR 0012](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0012-shared-neurotype-shaping-layer.md).
- **Plugin protocol schema** — `schemas/plugin.schema.json`. See
  [ADR 0007](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0007-plugin-protocol.md).

## Usage

```ts
import {
  assembleNeurotypeAddendum,
  neurotypeAddendaV1,
  type Profile,
} from "@neurodock/core";

const addendum = assembleNeurotypeAddendum(neurotypeAddendaV1, {
  tool: "translate_incoming",
  neurotypes: ["adhd", "asd"], // fuses to AuDHD
  outputFormat: "answer_first",
  maxChunkSize: 5,
  voiceInputPreferred: false,
});
// `addendum` is appended after the JSON schema block of a model prompt.
// An empty input (no neurotypes, all defaults) returns "".
```

The addendum is **content**, not schema shape: it never changes a tool's output schema
(per [ADR 0011](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0011-neurotype-schema-strategy.md)).

## License

AGPL-3.0-or-later
