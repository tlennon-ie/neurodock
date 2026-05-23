---
name: audit-motion
description: Check new CSS / JSX for animation that runs by default — the project default is `motion: reduced` and any motion must gate on prefers-reduced-motion.
---

# audit-motion

Pre-flight check for any UI change that adds animation. The profile
default per ADR 0004 is `motion: reduced` — i.e. no animation runs
unless the user has explicitly opted in. The `prefers-reduced-motion`
CSS media query is the floor; the profile preference is the ceiling.

Authoritative references:

- ADR 0004: `docs/decisions/0004-profile-schema-design.md` — "no
  animation by default" is one of the lived-experience-led defaults.
- Profile schema: `packages/core/schemas/profile.schema.json`
  (`preferences.motion: reduced | system | full`).

## When to use

- Before merging any PR that changes `.css`, `.scss`, `.tsx`, or `.jsx`
  in `packages/extension-browser/` or any docs site source.
- When adding a new component that uses animation libraries (framer,
  gsap, motion).
- Before an extension release — failing this check means a regression
  ships to users.

## What it does

1. Runs `git diff origin/main...HEAD --name-only` and filters to
   `.css`, `.scss`, `.tsx`, `.jsx`, `.ts`, `.js` under
   `packages/extension-browser/`, `docs/`, and any other site source.
2. For each file, scans added lines for animation tokens:
   - `transition:` / `transition-` (Tailwind)
   - `animation:` / `animation-` (Tailwind)
   - `@keyframes`
   - `framer-motion` imports
   - `gsap` / `ScrollTrigger` imports
   - `animate()` / `<motion.` JSX usage
3. For each hit, verifies that **either** the surrounding context is
   inside an `@media (prefers-reduced-motion: no-preference)` block (CSS)
   **or** the component reads `useReducedMotion()` / the profile's
   `preferences.motion` before triggering motion (JSX).
4. Reports unguarded hits.

## How to invoke

There is no scripted runner yet. Suggested invocation:

```bash
git diff origin/main...HEAD --name-only \
  | grep -E '\.(css|scss|tsx|jsx|ts|js)$' \
  | xargs -I{} grep -nHE \
    'transition[:-]|animation[:-]|@keyframes|framer-motion|from .gsap|<motion\.|animate\(' \
    {}
```

Then for each hit, confirm guard:

- CSS: a parent `@media (prefers-reduced-motion: no-preference) { ... }`
- JSX: a check against `useReducedMotion()` or the profile preference

## The required guard pattern

### CSS

```css
.card {
  /* Static styles always run */
  opacity: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .card {
    transition: opacity var(--duration-normal) var(--ease-out-expo);
  }
}
```

### React / JSX

```tsx
const reduced = useReducedMotion();
// ...
<div style={{ transition: reduced ? "none" : "opacity 300ms" }}>
```

Or, when honouring the profile preference (skill-side):

```tsx
const { motion } = useProfilePreferences();
if (motion === "reduced") return <Static />;
return <Animated />;
```

## Output format

```
packages/extension-browser/src/popup/Welcome.tsx:42: <motion.div> — no useReducedMotion / profile guard
packages/extension-browser/src/styles/card.css:18: transition: opacity 200ms — no prefers-reduced-motion media query
```

Exit non-zero on any unguarded hit.

## Limitations

- Heuristic regex; will produce false positives on string literals that
  contain the word `transition` outside CSS context.
- Does not detect motion implemented via canvas / WebGL / SVG SMIL — review
  those by hand.
- Does not enforce the profile preference at runtime — that is the
  responsibility of the component and the skill SDK
  (`@neurodock/skill-sdk` / `neurodock-skill`).

## Voice

When flagging an unguarded animation, name the user impact in one line:
"this animates on first load for every ND user with the default profile."
Do not lecture about vestibular sensitivity; the contributor either
already knows or will look it up.
