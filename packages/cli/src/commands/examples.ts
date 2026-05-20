import { readFileSync } from "node:fs";
import chalk from "chalk";
import { readEnv, colorEnabled } from "../lib/env.js";
import { detectClients } from "../lib/paths.js";
import { parseJsonSafely } from "../lib/json-patch.js";

export type ServerName =
  | "neurodock-chronometric"
  | "neurodock-cognitive-graph"
  | "neurodock-task-fractionator"
  | "neurodock-translation"
  | "neurodock-guardrail";

export interface ExamplePrompt {
  readonly prompt: string;
  readonly tool: string;
}

export interface ServerExamples {
  readonly server: ServerName;
  readonly label: string;
  readonly prompts: ReadonlyArray<ExamplePrompt>;
}

export interface ExamplesOptions {
  readonly server?: string;
  readonly json: boolean;
}

export interface ExamplesResult {
  /** which servers are wired anywhere across detected client configs */
  readonly wired: ReadonlyArray<ServerName>;
  readonly groups: ReadonlyArray<ServerExamples>;
  readonly messages: ReadonlyArray<string>;
}

export interface ExamplesDependencies {
  readonly envOverrides?: Parameters<typeof readEnv>[0];
  /** Override the color check (defaults to colorEnabled() from env). */
  readonly colorEnabled?: () => boolean;
}

const ALL_GROUPS: ReadonlyArray<ServerExamples> = [
  {
    server: "neurodock-chronometric",
    label: "mcp-chronometric (time, sessions, energy zone)",
    prompts: [
      {
        prompt: "What time is it and what's my energy zone?",
        tool: "get_time_context",
      },
      {
        prompt: "Start a session — I'm working on emails for the next 30 minutes.",
        tool: "mark_session_start",
      },
      {
        prompt: "I'm done. End my session and summarise what I got through.",
        tool: "mark_session_end",
      },
    ],
  },
  {
    server: "neurodock-cognitive-graph",
    label: "mcp-cognitive-graph (memory, facts, decisions)",
    prompts: [
      {
        prompt: "Remember: my dev box is Windows 11, Python 3.11, Node 22.",
        tool: "record_fact",
      },
      {
        prompt: "What do you know about my dev environment?",
        tool: "recall_entity",
      },
      {
        prompt: "What decisions have I made about the auth refactor in the last 30 days?",
        tool: "recall_decisions",
      },
      {
        prompt: "Give me a weekly rollup on the marketing site project.",
        tool: "weekly_rollup",
      },
    ],
  },
  {
    server: "neurodock-task-fractionator",
    label: "mcp-task-fractionator (decompose goals, pick next step)",
    prompts: [
      {
        prompt:
          "Decompose this goal into atomic tasks with a PT3H budget: 'Get the changelog ready for v1.0.'",
        tool: "decompose",
      },
      {
        prompt: "What should I do next on the auth refactor?",
        tool: "next_one",
      },
    ],
  },
  {
    server: "neurodock-translation",
    label: "mcp-translation (incoming/outgoing tone, meeting briefs)",
    prompts: [
      {
        prompt:
          "Translate this incoming Slack message — what is the explicit ask and what's the subtext: 'Hey, can we revisit the timeline next week?'",
        tool: "translate_incoming",
      },
      {
        prompt:
          "Tone-check this PR comment before I send it: 'this needs a rewrite — let me know'",
        tool: "check_tone",
      },
      {
        prompt:
          "Rewrite this for a 'warm' register without losing the technical detail: 'Fix the GraphQL N+1 in /api/users.'",
        tool: "rewrite_outgoing",
      },
      {
        prompt:
          "Brief this 30-minute meeting transcript — pull out my asks, others' asks, decisions, and ambiguous items. [paste transcript]",
        tool: "brief_meeting",
      },
    ],
  },
  {
    server: "neurodock-guardrail",
    label: "mcp-guardrail (rumination + loop checks — mostly invoked via skills)",
    prompts: [
      {
        prompt:
          "Check whether my last 5 questions about Postgres count as a rumination loop: [list of questions]",
        tool: "check_rumination",
      },
    ],
  },
];

export async function runExamples(
  options: ExamplesOptions,
  deps: ExamplesDependencies = {},
): Promise<ExamplesResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];

  // Probe which servers are wired across all detected client configs.
  const wired = detectWiredServers(env);

  // Filter by --server if supplied.
  const requested = options.server ?? null;
  if (requested !== null && !isKnownServer(requested)) {
    messages.push(
      `Unknown --server '${requested}'. Known: ${ALL_GROUPS.map((g) => g.server).join(", ")}.`,
    );
    return { wired, groups: [], messages };
  }

  const groups = ALL_GROUPS.filter((g) => {
    if (requested !== null && g.server !== requested) return false;
    return wired.includes(g.server);
  });

  if (groups.length === 0) {
    if (requested !== null) {
      messages.push(`Server '${requested}' is not wired in any detected MCP client config.`);
      messages.push("Run 'neurodock init' (or 'neurodock install-all') to wire it.");
    } else {
      messages.push("No NeuroDock servers detected in any client config.");
      messages.push("Run 'neurodock init' (or 'neurodock install-all') to wire them.");
    }
    return { wired, groups: [], messages };
  }

  if (options.json) {
    messages.push(JSON.stringify({ wired, groups }, null, 2));
    return { wired, groups, messages };
  }

  // Pretty output.
  const useColor = (deps.colorEnabled ?? colorEnabled)();
  for (const g of groups) {
    messages.push("");
    messages.push(useColor ? chalk.bold(g.label) : g.label);
    for (const p of g.prompts) {
      const promptLine = useColor ? chalk.cyan(`"${p.prompt}"`) : `"${p.prompt}"`;
      const toolLine = useColor ? chalk.dim(`→ ${p.tool}`) : `→ ${p.tool}`;
      messages.push(`  ${promptLine}`);
      messages.push(`    ${toolLine}`);
    }
  }
  messages.push("");
  messages.push(`Wired servers: ${wired.join(", ") || "(none)"}`);

  return { wired, groups, messages };
}

function detectWiredServers(env: ReturnType<typeof readEnv>): ReadonlyArray<ServerName> {
  const detections = detectClients(env).filter((d) => d.exists);
  const seen = new Set<ServerName>();
  for (const d of detections) {
    try {
      const raw = readFileSync(d.path, "utf8");
      const parsed = parseJsonSafely(raw);
      if (!parsed.ok) continue;
      const cfg = (parsed.value ?? {}) as { mcpServers?: Record<string, unknown> };
      for (const key of Object.keys(cfg.mcpServers ?? {})) {
        if (isKnownServer(key)) seen.add(key);
      }
    } catch {
      // unreadable config: skip silently.
    }
  }
  // Preserve canonical order from ALL_GROUPS so output is deterministic.
  return ALL_GROUPS.map((g) => g.server).filter((s) => seen.has(s));
}

function isKnownServer(key: string): key is ServerName {
  return ALL_GROUPS.some((g) => g.server === key);
}
