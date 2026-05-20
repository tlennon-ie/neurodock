import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncPrompts } from "../../scripts/sync-prompts.js";

const here = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

describe("sync-prompts", () => {
  it("copies all four canonical prompts into src/lib/prompts and public/prompts", () => {
    const result = syncPrompts();
    expect(result.skipped).toEqual([]);
    expect(result.copied.sort()).toEqual(
      [
        "brief_meeting.prompt.md",
        "check_tone.prompt.md",
        "rewrite_outgoing.prompt.md",
        "translate_incoming.prompt.md",
      ].sort(),
    );
    for (const name of result.copied) {
      expect(existsSync(resolve(here, "src", "lib", "prompts", name))).toBe(
        true,
      );
      expect(existsSync(resolve(here, "public", "prompts", name))).toBe(true);
    }
  });
});
