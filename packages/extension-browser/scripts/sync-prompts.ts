/**
 * sync-prompts.ts
 *
 * Build-time sync of the four translation prompt templates from the
 * canonical source at packages/mcp-translation into the extension bundle.
 *
 * Per ADR 0005 the MCP server and the browser extension share ONE prompt
 * library. We do not duplicate the prompts in this package; we mirror them
 * from the workspace sibling so:
 *
 * - Every prompt change in mcp-translation lands in the extension on next
 *   build.
 * - There is no drift between the two surfaces.
 * - CHANGELOG entries on the mcp-translation side are the source of truth
 *   for prompt versioning; this extension records "synced from
 *   <commit-sha>" in its own CHANGELOG.
 *
 * The files land at:
 *   src/lib/prompts/<tool>.prompt.md
 *
 * and are loaded at runtime via `import.meta.url` resolution from the
 * service worker. The .gitignore excludes them; the build step regenerates.
 *
 * Web-accessible copies under public/prompts/ are also produced so that
 * content scripts can request the raw prompt text via web_accessible_resources
 * (used in v0.0.2+ if we ever load prompts in a content script context;
 * v0.0.1 does all model calls in the service worker).
 */
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, "..");
const SOURCE_DIR = resolve(
  PKG_ROOT,
  "..",
  "mcp-translation",
  "src",
  "neurodock_mcp_translation",
  "prompts"
);
const LIB_TARGET = resolve(PKG_ROOT, "src", "lib", "prompts");
const PUBLIC_TARGET = resolve(PKG_ROOT, "public", "prompts");

interface SyncResult {
  copied: string[];
  skipped: string[];
}

export function syncPrompts(): SyncResult {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(
      `sync-prompts: source dir not found at ${SOURCE_DIR}. ` +
        `Is packages/mcp-translation present in the workspace?`
    );
  }
  mkdirSync(LIB_TARGET, { recursive: true });
  mkdirSync(PUBLIC_TARGET, { recursive: true });

  const expected = [
    "translate_incoming.prompt.md",
    "check_tone.prompt.md",
    "rewrite_outgoing.prompt.md",
    "brief_meeting.prompt.md",
  ];
  const available = new Set(readdirSync(SOURCE_DIR));
  const copied: string[] = [];
  const skipped: string[] = [];

  for (const name of expected) {
    if (!available.has(name)) {
      skipped.push(name);
      continue;
    }
    const src = join(SOURCE_DIR, name);
    copyFileSync(src, join(LIB_TARGET, name));
    copyFileSync(src, join(PUBLIC_TARGET, name));
    copied.push(name);
  }

  return { copied, skipped };
}

function isMain(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const argvUrl = "file://" + resolve(argv1).replace(/\\/g, "/");
  return import.meta.url === argvUrl || argvUrl.endsWith("sync-prompts.ts");
}

if (isMain()) {
  // Direct invocation via `tsx scripts/sync-prompts.ts`.
  const result = syncPrompts();
  // eslint-disable-next-line no-console
  console.log(
    `[sync-prompts] copied ${result.copied.length} prompt(s)` +
      (result.skipped.length > 0 ? `; skipped ${result.skipped.join(", ")}` : "")
  );
  if (result.copied.length === 0) {
    process.exit(1);
  }
}
