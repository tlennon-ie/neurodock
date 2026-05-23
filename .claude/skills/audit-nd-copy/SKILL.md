---
name: audit-nd-copy
description: Grep changed markdown / mdx / tsx string literals on the current branch for banned terms — superpower, spectrum colours, clinical phrasing, marketing intensifiers.
---

# audit-nd-copy

A pre-flight check that scans every user-facing string touched in the
current branch for words the project's voice guidelines reject. The
banned-term list is grounded in plan.md's voice section and the
project's manifesto.

## When to use

- Before opening any PR that changes a `.md`, `.mdx`, `.tsx`, `.ts`,
  `.html`, or `.yaml` file containing user-visible copy.
- Before cutting an extension release — store listings and side-panel
  copy must pass.
- When reviewing community-submitted skills (the `skill-author` agent
  uses this).

## What it does

1. Runs `git diff origin/main...HEAD --name-only` to get changed files.
2. Filters to copy-bearing file types: `.md`, `.mdx`, `.tsx`, `.ts`,
   `.html`, `.yaml`.
3. For each file, greps the added lines (not unchanged lines) for the
   banned-term list below.
4. Reports each hit with file, line number, term, and the matched line.

## Banned terms (v0.1.0)

### Pathologising / clinical phrasing in user-facing copy

`executive dysfunction`, `executive function`, `disorder`, `condition`,
`comorbid` / `comorbidity`, `symptom`, `diagnosis` / `diagnose`,
`treatment` / `therapy`, `meltdown`, `shutdown` (when describing the user),
`neurodivergence` as a noun (use `neurodivergent` as adjective only).

### Marketing intensifiers

`superpower`, `game-changing`, `revolutionary`, `disruptive`, `magical`,
`seamless`, `effortless`, `delightful`, `world-class`, `cutting-edge`,
`next-generation` / `next-gen`.

### "Spectrum colours" and other reductive metaphors

`spectrum colours` / `spectrum colors`, `on the spectrum` (use `autistic`),
`high-functioning`, `low-functioning`, `mild autism` / `mild ADHD`,
`severe autism` / `severe ADHD`.

### Sycophancy markers

`great question`, `excellent question`, `you're absolutely right`,
`I love that you`, `what a wonderful`, `that's such a great`.

## How to invoke

There is no scripted runner yet. Suggested invocation:

```bash
git diff origin/main...HEAD --name-only \
  | grep -E '\.(md|mdx|tsx|ts|html|yaml)$' \
  | xargs -I{} grep -nHE \
    'superpower|game.changing|revolutionary|disruptive|magical|seamless|effortless|delightful|world.class|cutting.edge|next.gen|spectrum colou?rs|on the spectrum|high.functioning|low.functioning|executive dysfunction|disorder|comorbid|symptom|diagnos|treatment|therapy|meltdown|great question|excellent question|you.re absolutely right' \
    {}
```

A scripted version belongs at `scripts/audit-nd-copy.sh` — the regex set
above is the authoritative starting point.

## Output format

```
docs/landing.mdx:42: superpower — "ADHD is a superpower" → reword
packages/extension-browser/src/popup/Welcome.tsx:18: seamless — "seamless integration" → reword
```

Exit non-zero on any hit. The contributor decides whether each hit is a
genuine violation or a defensible exception (e.g. quoting a third party).

## Allow-listing

If a hit is a quoted citation or otherwise defensible, prefix the line
with a `<!-- nd-copy-allow: <reason> -->` HTML comment for markdown or a
`// nd-copy-allow: <reason>` comment for code. The script (when built)
will honour these markers.

## Limitations

- Regex-based. False positives happen on words like `disorder` used in
  unrelated technical contexts (`reorder`, `recorded`). Review each hit.
- Only scans **added** lines on the current branch. Existing copy in the
  repo is out of scope — a separate full-repo scan is a one-off chore.
- Banned-term list is v0.1.0. Future revisions should update both this
  skill and `docs/branding.md` together.

## Voice

This skill is a critic, not a censor. It surfaces the hit and the
contributor decides. Do not auto-rewrite copy — the voice belongs to the
person shipping the change, with this skill as a check on the autopilot
phrases everyone reaches for.
