Subject: NeuroDock — `kipi-system` and a memory MCP

Hi Assaf,

`kipi-system` is the most honest external-memory design I have seen for AuDHD. The multi-tier separation — fast inbox, structured working memory, durable long-term — maps to how the cognition actually behaves, not to how a generic note-taking app wants it to behave. The append-only event log in particular is the part I keep pointing other people at.

I am writing because I am starting an open-source project called NeuroDock, and `kipi-system` is the direct ancestor of one of its core MCP servers.

NeuroDock is a local-first, MCP-native, AGPL-licensed cognitive substrate for neurodivergent professionals. One of the launch MCP servers is `mcp-cognitive-graph`: persistent entity and decision memory, with `recall_entity`, `record_fact`, `recall_decisions`, and `weekly_rollup` tools, backed by SQLite plus `sqlite-vec` and a JSONL event log. The event-log pattern is taken directly from `kipi-system` — credited in `plan.md` §4 and §16 — and the multi-tier architecture is the model I want to MCP-ify so any client can consume it.

What I would like, lightest to heaviest: a review of the `mcp-cognitive-graph` schema before it hits `v0.1`, a CODEOWNERS slot on that package, or a council seat. Whichever fits your current bandwidth.

Phase 0 closes in about four weeks. The RFC is open now.

Would a 15-minute call work in the next two weeks, or would you rather just send thoughts in reply?

— T
