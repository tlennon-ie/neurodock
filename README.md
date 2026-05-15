# NeuroDock — planning bundle

This is the planning bundle for **NeuroDock**: an open-source, MCP-native, vendor-neutral, local-first cognitive substrate for neurodivergent professionals. It's not yet code — it's the foundation: the plan, the principles, and the agent fleet that will execute the build.

## What's in this bundle

```
neurodock/
├── README.md            ← you are here
├── plan.md              ← the master plan
└── .claude/
    └── agents/          ← fifteen Claude Code subagents ready to deploy
        ├── orchestrator.md
        ├── repo-bootstrapper.md
        ├── governance-author.md
        ├── mcp-architect.md
        ├── mcp-server-builder.md
        ├── skill-author.md
        ├── browser-extension-builder.md
        ├── eval-curator.md
        ├── clinical-reviewer.md
        ├── design-system-keeper.md
        ├── accessibility-auditor.md
        ├── doc-writer.md
        ├── release-pilot.md
        ├── community-triage.md
        └── changelog-keeper.md
```

## How to use it

**Read `plan.md` first.** It's the single source of truth: manifesto, architecture, tech stack, repo layout, three-area deep dives, CI/CD policy, governance model, phased roadmap, success metrics, risks, and a concrete week-by-week 30-day kickoff. It also references each agent file by purpose and phase.

**Then drop the `.claude/` directory into your new repo.** The agent files are already in Claude Code subagent format — name + description + tools in frontmatter, operating manual in the body. When you start the actual repo at `github.com/neurodock` (Phase 0, week 1), this directory is the first commit alongside the governance documents.

## How the agent fleet works

Fifteen agents, each with a single clear scope. `orchestrator` is the entry point — it dispatches to the right specialist based on what a contributor is trying to do. Specialists handle their domain end-to-end and escalate to the maintainer council when they hit the boundaries of their authority (each agent file documents exactly when to escalate).

The fleet covers four kinds of work:

- **Setup** (`repo-bootstrapper`, `governance-author`) — heavy in Phase 0, quiet thereafter.
- **Building** (`mcp-architect`, `mcp-server-builder`, `skill-author`, `browser-extension-builder`, `eval-curator`, `clinical-reviewer`) — the bulk of Phases 1-3.
- **Quality** (`design-system-keeper`, `accessibility-auditor`, `doc-writer`, `changelog-keeper`) — continuous from day one.
- **Operations** (`release-pilot`, `community-triage`) — continuous from Phase 1 onward.

Each agent file is self-contained. A contributor (or you, with Claude Code) can read one file and have everything needed to act in that scope — purpose, triggers, operating principles, inputs, outputs, quality gates, escalation conditions, and common failure modes.

## Recommended next actions

1. **Read `plan.md` Section 15** — the concrete 30-day kickoff. That's where execution starts.
2. **Reserve the namespaces** (week 1): `github.com/neurodock`, `npm`, `PyPI`, `OpenCollective`, `neurodock.org`.
3. **Use `governance-author`** to draft `MANIFESTO.md` and `GOVERNANCE.md` as the first public RFC.
4. **Use `repo-bootstrapper`** to stand up the monorepo scaffold with green CI from commit one.

If you want any of the foundation documents (MANIFESTO, GOVERNANCE, ETHICS, CODE_OF_CONDUCT, the RFC issue body) drafted ready-to-publish, or want the chronometric MCP server tool schemas written out in detail before week 2 — just ask.

---

**License intent:** AGPL-3.0-or-later. To be confirmed by the founding council at first meeting.

**Status:** Pre-launch / planning. No code shipped yet.

**Maintainers:** TBD. Council to be seated in Phase 0.
