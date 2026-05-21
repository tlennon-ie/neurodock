# examples/

End-to-end walkthroughs. Each example is self-contained — profile file, install
notes, a real conversation transcript, and the expected tool calls. Pick the
example closest to the client you actually use.

Every example should run against a fresh clone in under fifteen minutes. If one
doesn't, please open an issue.

## Available examples

### `claude-desktop/`

Worked example for **Claude Desktop** (the standalone macOS / Windows app).
Covers: cloning the repo, running `dev-setup.sh`, the `init` command that
rewrites Claude Desktop's MCP config, restarting the app, and a sample
conversation that exercises the chronometric and cognitive-graph servers.

Start here if you want to actually use NeuroDock day-to-day. The walkthrough
mirrors `TESTING_LOCAL.md` but is tightened for the most common Claude Desktop
flow and includes a realistic sample dialogue.

### `founders-morning-brief/`

Opinionated end-to-end scenario: a founder with ADHD sits down at 08:30,
asks "plan my morning", and the substrate composes a brief from
`get_time_context`, last-session recall, and task fractionation. Walks through
the profile values that produce this behaviour and the expected tool-call
sequence.

Read this if you want to see what a "full" NeuroDock interaction looks like
once the skills, profile, and memory have settled in.

### `code-review-workflow/`

Worked example for an IC engineer running a 90-minute PR-review block.
Combines chronometric session bracketing, cognitive-graph recall of prior
comments on the changed files, and hyperfocus-formatter verdict-first
shaping. Includes one mid-block break trigger and a session-end
`record_fact`. NeuroDock does **not** read the code — the human still does
the review; the substrate makes the review block less expensive.

Read this if you do many reviews per week (especially senior+ ICs with
ADHD/AuDHD/dyslexia) and want to see how the three pillars stitch together
around a single 90-minute review block.

## When to add a new example

- A new MCP client gets supported (Cursor, Cline, Zed, etc.)
- A meaningfully different user archetype warrants its own walkthrough
  (e.g. autistic burnout recovery, OCD rumination scaffolding)

Keep examples grounded in real usage. No idealised "Claude is your perfect
co-pilot" transcripts — show the rough edges too.
