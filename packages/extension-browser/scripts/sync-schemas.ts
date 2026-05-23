/**
 * sync-schemas.ts — Build-time mirror of MCP translation output schemas.
 * Mirrors scripts/sync-prompts.ts so the extension never drifts from the
 * canonical schemas in packages/mcp-translation/schemas.
 */
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, "..");
const SOURCE_DIR = resolve(PKG_ROOT, "..", "mcp-translation", "schemas");
const LIB_TARGET = resolve(PKG_ROOT, "src", "lib", "schemas");
const PUBLIC_TARGET = resolve(PKG_ROOT, "public", "schemas");

interface SyncResult {
  copied: string[];
  skipped: string[];
}

const EXPECTED_SCHEMAS = [
  "translate_incoming.schema.json",
  "check_tone.schema.json",
  "rewrite_outgoing.schema.json",
  "brief_meeting.schema.json",
  "describe_image.schema.json",
] as const;

export function syncSchemas(): SyncResult {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(
      `sync-schemas: source dir not found at ${SOURCE_DIR}. ` +
        `Is packages/mcp-translation present in the workspace?`,
    );
  }
  mkdirSync(LIB_TARGET, { recursive: true });
  mkdirSync(PUBLIC_TARGET, { recursive: true });
  const available = new Set(readdirSync(SOURCE_DIR));
  const copied: string[] = [];
  const skipped: string[] = [];
  for (const name of EXPECTED_SCHEMAS) {
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
  return import.meta.url === argvUrl || argvUrl.endsWith("sync-schemas.ts");
}

if (isMain()) {
  const result = syncSchemas();
  // eslint-disable-next-line no-console
  console.log(
    `[sync-schemas] copied ${result.copied.length} schema(s)` +
      (result.skipped.length > 0
        ? `; skipped ${result.skipped.join(", ")}`
        : ""),
  );
  if (result.copied.length === 0) {
    process.exit(1);
  }
}
