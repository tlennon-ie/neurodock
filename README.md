# NeuroDock

> **Open-source, MCP-native, vendor-neutral, local-first cognitive substrate for neurodivergent professionals.**

NeuroDock plugs into Claude Desktop / Claude Code / Cursor (any MCP-aware
client) and gives the assistant a memory of your work, a sense of time, the
ability to decompose vague goals into atomic tasks, a translator for corporate
ambiguity, and guardrails against rumination loops.

Local-first by default. No telemetry. AGPL-3.0-or-later.

## Install

> Note: `npx neurodock` will be live once the npm publish lands. Until then,
> clone the repo and follow `TESTING_LOCAL.md` for a working setup against
> Claude Desktop.

```bash
npx neurodock init
```

That single command:

1. Detects your Claude client (Desktop, Code, or Cursor)
2. Wires the NeuroDock MCP servers into your client's config
3. Copies a starter profile to `~/.neurodock/profile.yaml`
4. Tells you to restart Claude

Then in any conversation: `"What was I working on yesterday?"` /
`"Plan my morning"` / `"Decompose this goal"`. Claude calls the MCP tools
under the hood; you just talk.

## What's inside

```
neurodock/
├── packages/
│ ├── mcp-chronometric/ Time + session + break management
│ ├── mcp-cognitive-graph/ Persistent memory + entity recall (SQLite)
│ ├── mcp-task-fractionator/ Decompose vague goals into atomic tasks
│ ├── mcp-translation/ Corporate-speak translator (MCP + browser ext)
│ ├── mcp-guardrail/ Rumination / hyperfocus / sycophancy detectors
│ ├── skills/ Six SKILL.md bundles activating on phrases
│ ├── extension-browser/ WXT-built Chrome / Firefox / Edge extension
│ ├── cli/ `npx neurodock init` and friends
│ ├── core/ Shared types, profile schema, plugin spec
│ ├── clinical/ Heuristic library for the guardrail server
│ └── evals/ Eval harness + corpus contribution pipeline
├── docs/ Astro Starlight site (deploys to docs.neurodock.org)
├── plugins/ Drop your own plugins here; auto-discovered
└── profiles/ Curated profile presets
```

## Status

**v0.2.0 developer preview.** All three substrate pillars (cognitive,
communication, guardrails) are built and merged on `main`.

| Surface | State |
|---|---|
| MCP chronometric | v0.0.1 — 5 tools, 22 tests, mypy --strict |
| MCP cognitive-graph | v0.0.1 — 4 tools, SQLite storage, 25 tests |
| MCP task-fractionator | v0.0.1 — 2 tools, 32 tests |
| MCP translation | v0.0.1 — 4 tools, 29 tests, deterministic baseline + LLM refinement |
| MCP guardrail | v0.0.1 — rumination detection live; hyperfocus + sycophancy schema-only |
| Six launch skills | adhd-daily-planner, audhd-context-recovery, ocd-decision-finalizer (beta), hyperfocus-formatter, visual-organizer, asd-meeting-translator |
| Browser extension | v0.0.1 scaffold — 7 sites supported, MV3, mock LLM by default |
| CLI installer | v0.0.1 — init, doctor, profile commands |
| Docs site | 39 pages, builds clean |
| Eval harness | Air-gapped, 10 synthesised seed examples |

What's deferred to a follow-up release:

- Real Ollama / cloud-provider wiring in the browser extension
- Embedding-based fuzzy entity recall (currently exact + alias only)
- `check_hyperfocus` + `check_sycophancy` implementations
- Browser-store submissions

## How to actually test it right now

**`TESTING_LOCAL.md`** — step-by-step guide to running this against your
Claude Desktop, today, from a clone. Takes about 5 minutes.

## Documentation

When the docs site is deployed, it'll live at `docs.neurodock.org`. Until
then, the source is at `docs/src/content/docs/` and you can preview it
locally:

```bash
pnpm --filter @neurodock/docs run dev
# opens http://localhost:4321
```

## Architecture

The substrate splits into three pillars:

1. **Cognitive substrate** — externalises executive function (time,
 memory, decomposition). MCP servers: chronometric, cognitive-graph,
 task-fractionator.
2. **Communication layer** — translates corporate ambiguity; rewrites
 outgoing messages for register-appropriate tone; structures meeting
 transcripts. MCP server: translation. Browser extension surfaces the
 same prompts in Gmail / Slack / Linear / Notion / GitHub / Docs / Outlook.
3. **Clinical guardrails** — detects and intervenes on rumination
 (repeat-validation loops), hyperfocus (escalating session-length
 nudges), and sycophancy (unconditional agreement). MCP server: guardrail.
 Heuristics are public and auditable per `ETHICS.md`.

All three layers compose via the same MCP protocol the LLM client already
speaks. There's no "NeuroDock app" — the surface is your Claude client.

Design rationale lives in `docs/decisions/`:

- ADR 0001 — chronometric tool design
- ADR 0002 — cognitive-graph tool design
- ADR 0003 — task-fractionator tool design
- ADR 0004 — profile schema
- ADR 0005 — translation tool design
- ADR 0006 — guardrail tool design
- ADR 0007 — plugin protocol

## Contributing

`CONTRIBUTING.md` has the welcome + on-ramp. Two contribution lanes:

- **Skills** — markdown bundles that activate on phrases. Easiest entry
 point. See `docs/src/content/docs/contribute/write-a-skill.mdx`.
- **Code** — MCP servers, CLI commands, shared infrastructure. See
 `docs/src/content/docs/contribute/write-a-plugin.mdx` for the plugin
 protocol if you're shipping out-of-tree.

## Manifesto (short)

1. **Lower friction for users, and for contributors.**
2. **Local-first by default; cloud is opt-in.**
3. **The user is the authority.** Self-ID sufficient.
4. **Composable over monolithic.** No god-modules.
5. **Refuse where appropriate.** AI that fuels rumination, hyperfocus, or
 anxiety is a regression, not a feature.

Full text in `MANIFESTO.md`. Ethics framework in `ETHICS.md`. Governance
in `GOVERNANCE.md`.

## License

[AGPL-3.0-or-later](LICENSE). Plugins must declare an AGPL-compatible license
to load — the SPDX whitelist is in ADR 0007.
