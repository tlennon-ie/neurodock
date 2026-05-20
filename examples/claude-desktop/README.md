# Example: NeuroDock in Claude Desktop

A worked end-to-end walkthrough. Clone, install, wire into Claude Desktop,
edit your profile, run a real conversation. Should take under fifteen minutes
on a clean machine.

This is the tightened "happy path" — for the full troubleshooting reference,
see `TESTING_LOCAL.md` at the repo root.

## What you'll have at the end

- NeuroDock's MCP servers installed locally from source
- Claude Desktop pointed at them via `claude_desktop_config.json`
- A profile at `~/.neurodock/profile.yaml` reflecting your neurotype and
  preferences
- A conversation that demonstrates time context, session marking, break
  suggestions, and persistent memory

## Prerequisites

- Node 22+, pnpm 11+, Python 3.11+, `uv`
- [Claude Desktop](https://claude.ai/download) installed and signed in
- A fresh clone of `neurodock/neurodock`

## Step 1 — Bootstrap

From the repo root:

```bash
./scripts/dev-setup.sh
```

This installs all dependencies, builds the workspace, and runs the test
suites. If anything fails here, fix it before continuing — the rest of the
walkthrough assumes a green build.

On Windows without WSL, run the equivalent commands manually:

```powershell
pnpm install --frozen-lockfile
uv sync --all-packages --all-extras
pnpm turbo run build
```

## Step 2 — Wire NeuroDock into Claude Desktop

The CLI's `init` command rewrites Claude Desktop's MCP config to point at the
local servers.

```bash
# Dry-run first to see exactly what would change
node packages/cli/dist/index.js init --dry-run

# Then for real
node packages/cli/dist/index.js init
```

This:

1. Detects your Claude Desktop config path
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS:   `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux:   `~/.config/Claude/claude_desktop_config.json`
2. Adds entries under `mcpServers` for each NeuroDock server, pointing at the
   absolute paths of the console scripts in your uv venv
3. Copies `packages/core/schemas/profile.minimal.yaml` to
   `~/.neurodock/profile.yaml`

## Step 3 — Restart Claude Desktop

Claude Desktop only reads the MCP config at startup. Quit fully (kill from the
system tray on Windows, `Cmd+Q` on macOS) and reopen.

## Step 4 — Edit your profile

Open `~/.neurodock/profile.yaml`. The minimal version looks like this:

```yaml
identity:
  display_name: "Your Name"
  neurotypes: ["adhd"]          # self-ID only; pick what fits
preferences:
  output_format: "answer_first"
  motion: "reduced"
chronometric:
  hyperfocus_break_minutes: 90
  end_of_day_local: "18:30"
```

Save the file. The skills read this at the start of each session.

## Step 5 — Talk to it

Open a new Claude Desktop conversation. Try:

> What time is it and what's my energy zone?

Expected tool call:

```
get_time_context()
```

Expected response shape (yours will reflect your actual local time):

```
It's 09:14 on Tuesday. You're in your "morning_focus" energy zone —
clock-band reading, not your real biometrics. Want to start a session?
```

Then:

> Start a session — I'm clearing the inbox for the next 30 minutes.

Expected tool call:

```
mark_session_start({ intent: "clearing the inbox", duration_minutes: 30 })
```

For the full sample dialogue including break suggestions, session end, and
recording a fact for next time, see [`sample-conversation.md`](./sample-conversation.md).

## Things to notice

- **Tool-use indicators** appear in the chat when Claude actually invokes a
  NeuroDock tool. If you don't see them, the MCP config didn't load —
  re-run `init` and restart Claude Desktop fully.
- **The substrate is local.** Nothing leaves your machine. The profile, the
  cognitive graph, the session log — all on disk under `~/.neurodock/`.
- **The skills are scoped.** A skill only activates when its triggers match.
  Don't expect every prompt to invoke a tool; that's the design.

## What's not in this example

- The browser extension (different setup — see
  `packages/extension-browser/README.md`)
- Cursor / Cline / Zed (the `init` command supports these too, but each has
  its own gotchas — separate walkthroughs land later)
- The task-fractionator and translation servers (covered in
  `examples/founders-morning-brief/`)

## Troubleshooting

Claude doesn't see the MCP servers? Check
`claude_desktop_config.json` actually got the entries — the CLI prints a diff
when you run `init`. The most common cause is forgetting to fully quit Claude
Desktop before reopening.

For everything else, see the troubleshooting section of `TESTING_LOCAL.md`.
