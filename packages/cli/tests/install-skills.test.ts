import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInstallSkills } from "../src/commands/install-skills.js";

interface Sandbox {
  readonly root: string;
  readonly home: string;
  readonly cwd: string;
  /** A fake "bundled skills" source dir under the sandbox. */
  readonly skillsSource: string;
  readonly cleanup: () => void;
}

const SKILL_NAMES = [
  "adhd-daily-planner",
  "asd-meeting-translator",
  "audhd-context-recovery",
  "hyperfocus-formatter",
  "ocd-decision-finalizer",
  "visual-organizer",
];

function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "neurodock-installskills-"));
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  const skillsSource = join(root, "bundled-skills");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  // Seed a fake bundled-skills source mirroring the published dist layout:
  // one SKILL.md per skill, with author docs + tests that must NOT be copied.
  for (const name of SKILL_NAMES) {
    const dir = join(skillsSource, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\n---\nbody for ${name}\n`,
    );
  }
  return {
    root,
    home,
    cwd,
    skillsSource,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

function envFor(sandbox: Sandbox): {
  platform: "linux";
  home: string;
  cwd: string;
  user: string;
  env: NodeJS.ProcessEnv;
} {
  return {
    platform: "linux",
    home: sandbox.home,
    cwd: sandbox.cwd,
    user: "tester",
    env: {} as NodeJS.ProcessEnv,
  };
}

describe("neurodock install-skills", () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = makeSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("copies every bundled SKILL.md into ~/.claude/skills/neurodock-<name>/", async () => {
    const r = await runInstallSkills(
      { client: "all", dryRun: false, yes: true },
      { envOverrides: envFor(sandbox), skillsSourceDir: sandbox.skillsSource },
    );

    expect(r.exitCode).toBe(0);
    for (const name of SKILL_NAMES) {
      const dest = join(
        sandbox.home,
        ".claude",
        "skills",
        `neurodock-${name}`,
        "SKILL.md",
      );
      expect(existsSync(dest)).toBe(true);
      expect(readFileSync(dest, "utf8")).toContain(`body for ${name}`);
    }
  });

  it("never copies tests/, README.md, or CHANGELOG.md from the source", async () => {
    // Add author-facing junk to one skill source.
    const dir = join(sandbox.skillsSource, "adhd-daily-planner");
    writeFileSync(join(dir, "README.md"), "author readme\n");
    writeFileSync(join(dir, "CHANGELOG.md"), "author changelog\n");
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests", "case1.md"), "test case\n");

    await runInstallSkills(
      { client: "all", dryRun: false, yes: true },
      { envOverrides: envFor(sandbox), skillsSourceDir: sandbox.skillsSource },
    );

    const installed = join(
      sandbox.home,
      ".claude",
      "skills",
      "neurodock-adhd-daily-planner",
    );
    expect(existsSync(join(installed, "SKILL.md"))).toBe(true);
    expect(existsSync(join(installed, "README.md"))).toBe(false);
    expect(existsSync(join(installed, "CHANGELOG.md"))).toBe(false);
    expect(existsSync(join(installed, "tests"))).toBe(false);
  });

  it("--dry-run writes nothing and reports the planned targets", async () => {
    const r = await runInstallSkills(
      { client: "all", dryRun: true, yes: true },
      { envOverrides: envFor(sandbox), skillsSourceDir: sandbox.skillsSource },
    );

    expect(r.exitCode).toBe(0);
    expect(existsSync(join(sandbox.home, ".claude", "skills"))).toBe(false);
    const joined = r.messages.join("\n");
    expect(joined).toContain("Dry run");
    expect(joined).toContain("neurodock-adhd-daily-planner");
  });

  it("is idempotent — re-running refreshes content without error", async () => {
    const opts = { client: "all", dryRun: false, yes: true } as const;
    const deps = {
      envOverrides: envFor(sandbox),
      skillsSourceDir: sandbox.skillsSource,
    };
    const first = await runInstallSkills(opts, deps);
    expect(first.exitCode).toBe(0);

    // Mutate the source so we can assert the refresh actually overwrote.
    writeFileSync(
      join(sandbox.skillsSource, "visual-organizer", "SKILL.md"),
      "---\nname: visual-organizer\n---\nUPDATED body\n",
    );
    const second = await runInstallSkills(opts, deps);
    expect(second.exitCode).toBe(0);

    const dest = join(
      sandbox.home,
      ".claude",
      "skills",
      "neurodock-visual-organizer",
      "SKILL.md",
    );
    expect(readFileSync(dest, "utf8")).toContain("UPDATED body");
  });

  it("skips Cursor with a clear notice (no skills system) and does not error", async () => {
    const r = await runInstallSkills(
      { client: "cursor", dryRun: false, yes: true },
      { envOverrides: envFor(sandbox), skillsSourceDir: sandbox.skillsSource },
    );

    expect(r.exitCode).toBe(0);
    expect(existsSync(join(sandbox.home, ".claude", "skills"))).toBe(false);
    const joined = r.messages.join("\n");
    expect(joined.toLowerCase()).toContain("cursor");
    expect(joined.toLowerCase()).toContain("skip");
  });

  it("installs into the shared ~/.claude/skills for claude-desktop too", async () => {
    const r = await runInstallSkills(
      { client: "claude-desktop", dryRun: false, yes: true },
      { envOverrides: envFor(sandbox), skillsSourceDir: sandbox.skillsSource },
    );

    expect(r.exitCode).toBe(0);
    const dest = join(
      sandbox.home,
      ".claude",
      "skills",
      "neurodock-adhd-daily-planner",
      "SKILL.md",
    );
    expect(existsSync(dest)).toBe(true);
  });

  it("returns exit 1 with a packaging-bug message when no bundled skills are found", async () => {
    const r = await runInstallSkills(
      { client: "all", dryRun: false, yes: true },
      {
        envOverrides: envFor(sandbox),
        skillsSourceDir: join(sandbox.root, "does-not-exist"),
      },
    );

    expect(r.exitCode).toBe(1);
    expect(r.messages.join("\n").toLowerCase()).toContain("packaging");
  });

  it("prints a per-skill installed summary line", async () => {
    const r = await runInstallSkills(
      { client: "all", dryRun: false, yes: true },
      { envOverrides: envFor(sandbox), skillsSourceDir: sandbox.skillsSource },
    );

    const joined = r.messages.join("\n");
    expect(joined).toMatch(/6 skill/);
    expect(joined).toContain(".claude");
  });
});
