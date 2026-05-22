# Testing NeuroDock locally

Two paths into this file:

- **Fast path** — you just want to try NeuroDock against your Claude install
  without thinking. One command.
- **Dev path** — you want to develop on NeuroDock itself from a clone of the
  monorepo.

Start with the fast path. Skip to the dev path only if the fast path is not
enough.

## Fast path — one command

```sh
npx --yes @neurodock/cli@latest install-all
```

That single command:

1. Installs the six Python MCP servers from PyPI (using `uv` if it's on PATH,
   otherwise `python -m pip`).
2. Detects Claude Desktop, Claude Code, and/or Cursor and wires the MCP
   server entries into each one's config.
3. Copies the starter profile to `~/.neurodock/profile.yaml`.
4. Prints the next step (which is: **fully quit and reopen Claude**).

Then in any Claude conversation:

```
What time is it and what's my energy zone?
```

Claude will invoke `get_time_context` and respond with your real local time
plus the clock-band energy zone. You'll see a tool-use indicator in the chat.

If nothing happens, the most common cause is that you didn't fully quit
Claude — see the troubleshooting block at the bottom of this file.

## Dev path — from a clone

This is for when you want to develop on NeuroDock itself rather than just
use it. The fast path above does not require a clone or any pnpm/uv setup.

### Prerequisites

- Windows / macOS / Linux
- **Node 22+** — `node --version`
- **Python 3.11+** — `python --version`
- **uv** — `uv --version` (install: `pip install uv` or `winget install astral-sh.uv`)
- **pnpm 11+** — `pnpm --version` (install: `npm install -g pnpm`)
- **Claude Desktop** — `https://claude.ai/download` (this is the MCP client we'll wire into)

### Step 1 — Build the substrate

From the repo root:

```bash
pnpm install --frozen-lockfile
uv sync --all-packages --all-extras
```

Should finish in under a minute the first time. The Python servers are now
importable from the workspace venv.

### Step 2 — Verify the servers work standalone

Try the chronometric server in-process (no Claude needed for this step):

```bash
uv run python -c "import asyncio; from neurodock_mcp_chronometric.server import app; print(asyncio.run(app.call_tool('get_time_context', {})).structured_content)"
```

You should see your local time + day_of_week + energy_zone.

### Step 3 — Build the CLI

```bash
pnpm --filter @neurodock/cli run build
```

This produces `packages/cli/dist/index.js`. You can invoke it directly:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js doctor
```

### Step 4 — Install into Claude Desktop

The CLI's `init` command rewrites Claude Desktop's MCP config to point at the
local server scripts.

```bash
# Dry-run first to see what it would change
node packages/cli/dist/index.js init --dry-run

# Then for real
node packages/cli/dist/index.js init
```

This:

1. Detects your platform's Claude Desktop config path

   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Adds entries under `mcpServers` for each NeuroDock server, pointing at
   the `neurodock-mcp-chronometric` etc. console scripts in your local uv venv.
3. Copies `packages/core/schemas/profile.minimal.yaml` to `~/.neurodock/profile.yaml`.
4. Prints next steps.

### Step 5 — Restart Claude Desktop

Claude Desktop only reads the MCP config at startup. Quit fully and reopen.

### Step 6 — Try it out

In a new Claude Desktop conversation, try:

```
What time is it and what's my energy zone?
```

Claude should invoke `get_time_context` and respond with your real local time
and the clock-band energy zone. You'll see a tool-use indicator in the chat.

Then:

```
Start a session — I'm going to work on emails for the next 30 minutes.
```

Claude invokes `mark_session_start` with your stated intent.

Then ask:

```
What was I working on?
```

Claude invokes `get_time_context` again; the session_length is now positive.

```
End my session — I got through the priority inbox.
```

Claude invokes `mark_session_end` with the summary.

### Step 7 — Edit your profile

Open `~/.neurodock/profile.yaml` and set:

```yaml
identity:
  display_name: "Thomas" # your name
  neurotypes: ["adhd"] # whatever applies; self-ID only
preferences:
  output_format: "answer_first"
  motion: "reduced"
chronometric:
  hyperfocus_break_minutes: 90
  end_of_day_local: "18:30"
```

The skills read this. After editing, ask Claude:

```
Plan my morning.
```

If you have `adhd-daily-planner` activated, Claude will use `get_time_context`
and (when cognitive-graph has memories) `weekly_rollup` to produce a brief.

## Troubleshooting

**Claude doesn't see the MCP servers**: Check that
`%APPDATA%\Claude\claude_desktop_config.json` actually got the entries —
the CLI prints a diff. Restart Claude Desktop fully (kill from system tray
on Windows, Cmd+Q on macOS). Closing the window is not enough.

**`neurodock-mcp-chronometric: command not found`**: The uv venv's bin
directory isn't on Claude Desktop's PATH. The CLI should write absolute paths
to the console scripts; check the config JSON. If it's relative, regenerate
via `node packages/cli/dist/index.js init --force`.

**A tool errors with VALIDATION_FAILED**: That's the schema rejecting bad
input. Look at the tool's schema under `packages/<server>/schemas/*.schema.json`
to see what's required.

**Browser extension**: Different setup — see `packages/extension-browser/README.md`.
The extension loads from `pnpm --filter @neurodock/extension-browser dev`
which opens Chrome with the unpacked extension. This is for testing only;
the published store version comes later.

## What to expect

Things that work today:

- Time context, session marking, break suggestions.
- Persistent memory across sessions (cognitive-graph).
- Task decomposition.
- Translation prompts (extension or via tools).
- **All three guardrail detectors**: rumination, hyperfocus, sycophancy.
- The browser extension's real LLM providers: Ollama (local default),
  Anthropic, OpenAI, OpenRouter (incl. `openrouter/auto`).

Things still being polished:

- Embedding-based fuzzy entity recall (uses exact + alias + fuzzy match;
  the 4th rung — embedding — is wired but tuned conservatively).
- OS idle probe (gate works; refining the real reading on Windows).
- Browser-store submissions (artefacts build clean; developer-account
  flow is manual).

## Reset / uninstall

```bash
# Remove the MCP entries from Claude Desktop config
node packages/cli/dist/index.js uninstall

# Delete your profile + local data
rm -rf ~/.neurodock/
```
