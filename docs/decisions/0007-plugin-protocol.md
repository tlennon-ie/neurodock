# 0007 — Plugin protocol design (NeuroDock plugins v0.1.0)

- **Status:** accepted
- **Date:** 2026-05-16
- **Deciders:** maintainer (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder` (will implement plugin discovery in `packages/core`), `skill-author` (out-of-tree skills follow this manifest plus the SKILL.md convention), `design-system-keeper` (owns `theme` plugins), `governance-author` (ETHICS + license alignment), (clinical-claim prohibition in `description`), `community-triage` (contributor on-ramp)
- **Informed:** `accessibility-auditor`, `doc-writer`, `release-pilot`, `changelog-keeper`, `eval-curator` (language-pack overrides shadow translation-prompt slices)

## Context

defines the plugin protocol in one paragraph: every directory under `plugins/` ships a `plugin.yaml` manifest declaring "name, type (`skill | mcp-server | profile | translation-pack | language-pack`), version, neurotype tags, and trust level," and the substrate auto-discovers plugins matching the user's profile. §11 Phase 3 promises a federated registry at `plugins.neurodock.org` and language packs for ≥ 3 locales. ADR 0005 (translation tools, open question 3) flagged that the language-pack manifest schema would need its own ADR before external contributors could land packs. This ADR is that schema.

Three properties make this contract load-bearing:

1. **Six plugin types across two ecosystems.** Skills are Markdown + frontmatter; MCP servers are Python or TS executables; profiles are YAML; translation packs and language packs are prompt files; themes are CSS + tokens. One manifest must describe all six without becoming six manifests in a trench coat.

2. **Trust without central authority.** The federated registry (Phase 3) is opt-in. The protocol itself MUST work for an air-gapped install where a user drops a directory into `~/.neurodock/plugins/` and the substrate discovers it via filesystem scan. We need a trust mechanism that does not require phoning home.

3. **License-boundary protection.** The substrate is AGPL-3.0-or-later. Plugins distributed alongside it MUST be license-compatible, or the project's license posture is structurally undermined the first time a non-compatible plugin ships. The manifest is where this gate lives.

Two earlier ADRs constrain the shape:

- **ADR 0004 (profile schema)** established `additionalProperties: true` at every level + loader-preserves-unknown-keys as the forward-compat strategy. Plugins must follow the same rule so a v0.1.0 install can read a v0.2.0 manifest without data loss.
- **ADR 0005 (translation tools)** assumed language packs would be plugins of `type: language-pack` whose prompts override defaults. This ADR makes that assumption concrete: a `provides[].type: language-prompt-override` entry shadows the matching default prompt for the manifest's `locale`.

## Decision drivers

1. **Forward-compatibility over strictness.** Same rationale as ADR 0004: lockstep cross-package upgrades are the failure mode we are most determined to avoid. `additionalProperties: true` at every level; loaders preserve unknown keys.
2. **Low-friction contribution.** A new plugin must be addable in under fifteen minutes (manifesto principle 1). The minimal manifest is six fields long.
3. **Trust without central authority.** A four-tier ladder that degrades gracefully when no registry exists.
4. **License-boundary protection.** SPDX whitelist enforced at load time; non-listed licenses refuse to load with a loud structured error.
5. **Composability with the profile.** A plugin's `neurotypes` and `locale` declarations intersect with the user's `profile.identity.neurotypes` to decide auto-activation. Profile remains the single consent surface.
6. **One source of truth.** The schema lives at `packages/core/schemas/plugin.schema.json`. No package re-declares the shape.

## Considered options

### Option A — Ad-hoc plugin discovery (no manifest)

Plugins ship a SKILL.md or a `__init__.py` and the substrate sniffs the directory contents.

**Rejected because:**

- Cannot express the cross-cutting metadata (trust, license, neurotypes, locale) that drives auto-activation and security decisions. SKILL.md frontmatter is per-skill; it doesn't fit MCP servers, profiles, themes, or language packs.
- No structural gate for license compatibility — the substrate would have to grep the source tree, which is brittle and circumventable.
- No room for the trust ladder. The federated registry would have to invent its own out-of-band metadata, which means the in-tree and federated paths diverge.

### Option B — Dedicated `plugin.yaml` manifest with JSON Schema validation (chosen)

One YAML manifest per plugin, validated against `plugin.schema.json` at load time. `additionalProperties: true` everywhere. Six plugin types in v0.1.0; new types are an additive change. SPDX whitelist enforced. Four-tier trust ladder.

### Option C — Reuse `package.json` (npm-style) or `pyproject.toml`

Two manifests in two ecosystems; plugins that span both (a skill + an MCP-server bundle) would need both.

**Rejected because:**

- Couples the manifest to language ecosystems. A profile or language pack has no `package.json` to reuse.
- npm and PyPI tooling assumes a publishing model the federated registry does not (yet) implement. Borrowing the format would invite confusion ("can I `npm install` this?") that the project explicitly is not committing to in v0.1.0.
- Custom fields under `package.json` extensions tend to bit-rot when the upstream tool changes its custom-field tolerance. We would have built a manifest that ages on someone else's schedule.

### Option D — One global registry file (`plugins.lock.yaml` at the repo root)

A single file enumerating every plugin and its metadata.

**Rejected because:**

- Single-point-of-merge-conflict. Two contributors adding two unrelated plugins always conflict.
- Air-gapped installs can't add a plugin by dropping a directory; they have to edit the central file. Breaks contributor principle 1.
- Federated discovery becomes ambiguous: is the lock file the authority, or each plugin's directory?

## Decision

We adopt **Option B: dedicated `plugin.yaml` manifest with JSON Schema validation.** Schema lives at `packages/core/schemas/plugin.schema.json`. Discovery is filesystem-based in v0.1.0; the federated registry indexes the same manifests in Phase 3.

### Ten binding design decisions

1. **Forward-compatibility is paramount.** Mirrors ADR 0004. `additionalProperties: true` at every nesting level. Loaders preserve unknown keys on round-trip. Adding a new plugin type, a new asset sub-type, a new optional field, or a new trust level is an additive change — no major bump required. Removing a value or renaming a field is a major bump.

2. **Four-tier trust ladder.**

   - `official` — published by the NeuroDock Maintainer. Installs without prompting.
   - `verified` — signed by a contributor whose key is in the maintainer-maintained keyring. Installs without prompting.
   - `community` — signed by the author's own key. Provenance recorded but not vouched. Prompts the user per profile preference; default profile setting is "prompt once, remember per plugin."
   - `experimental` — unsigned. Substrate refuses by default; the user opts in explicitly via `neurodock plugin trust <name> --once` or by raising `profile.plugins.allow_experimental`.

   Substrate behaviour is fully determined by trust level + the user's profile-declared plugin policy. There is no hidden allow-list.

3. **Six plugin types (extends plan.md's five).** `skill | mcp-server | profile | translation-pack | language-pack | theme`. `theme` is added in v0.1.0 because `design-system-keeper` already needs a delivery format for opt-in visual variants (high-contrast, dyslexia-tuned, dim-dark variants); shipping themes through the same protocol avoids inventing a second one in three months. Adding a new type later is forward-compat: v0.1.0 loaders encountering an unknown `type` MUST skip the plugin with a structured `unknown_plugin_type` warning rather than erroring.

4. **Discovery via filesystem scan.** v0.1.0 substrate walks two roots at init:

   - `<repo>/plugins/*/plugin.yaml` (in-repo plugins)
   - `$XDG_DATA_HOME/neurodock/plugins/*/plugin.yaml` (per-user plugins; falls back to `~/.local/share/neurodock/plugins` on Linux, `%APPDATA%\neurodock\plugins` on Windows, `~/Library/Application Support/neurodock/plugins` on macOS).

   No central registry is required. The federated registry at `plugins.neurodock.org` (Phase 3) is opt-in: it indexes signed manifests, provides search, and offers a `neurodock plugin install <name>` shortcut that fetches a plugin into the per-user root. The protocol does NOT depend on the registry; an air-gapped install works identically.

5. **`requires` is hard but acyclic.** Plugin A may not declare `requires.plugins` containing B if B requires A. Substrate detects cycles via topological-sort at load time. Validation algorithm:

   1. Build a directed graph: nodes are plugin names; edges are `requires.plugins[*].name`.
   2. Run Tarjan's strongly-connected-components.
   3. Any SCC with size ≥ 2 is a cycle. Loader logs `plugin_requirement_cycle` listing every plugin in the SCC and refuses to activate any of them. Other plugins outside the SCC load normally.

   Unmet requirements (a required MCP server is not installed, a required substrate version is out of range) result in the plugin being installed-but-not-activated, with a structured warning. Refusal is loud, never silent.

6. **`provides[].path` paths are sandboxed.** All asset paths and hook script paths are relative to the plugin's directory. Loader normalisation rule:

   1. Resolve the path against the plugin's absolute directory.
   2. Reject if the resolved absolute path does not have the plugin directory as a prefix (handles `..` traversal).
   3. Reject if any path segment is a symlink pointing outside the plugin directory (handles symlink escape).
   4. Reject absolute paths and Windows-style drive prefixes.

   Path validation runs at manifest load, before any asset is opened. A plugin that fails path validation is rejected entirely (not partially loaded).

7. **License compatibility is enforced at load.** SPDX whitelist on the `license` field: `AGPL-3.0-or-later`, `AGPL-3.0-only`, `GPL-3.0-or-later`, `GPL-3.0-only`, `LGPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-3-Clause`, `BSD-2-Clause`, `ISC`, `MPL-2.0`, `CC0-1.0`. Plugins with any other value refuse to load with a structured `license_not_allowed` error. The whitelist is intentionally conservative: it can only be EXTENDED in additive minor bumps via ADR; removing a license is a major bump. Custom-license declarations (`LicenseRef-*`) are not accepted in v0.1.0 — every plugin is a known, OSI-recognised license or it does not ship.

8. **Signature mechanism is reserved in v0.1.0; verified in Phase 3.** The schema reserves `trust.signature` and `trust.keyring_fingerprint`. The signature is computed over `sha256(plugin.yaml + concatenation of provides[].path file contents in declaration order)`. v0.1.0 loaders store the signature on round-trip but do NOT verify it; the user's effective trust level for an `official` or `verified` plugin in v0.1.0 is "trust the maintainer-curated repo where this plugin lives." Signature verification ships in `packages/core` in Phase 3 alongside the federated registry. Until verification ships, `verified` is operationally equivalent to `community` for user-experience purposes; the schema field is in place so we don't have to re-architect when verification lands.

9. **Hooks are optional and refuse-by-default in v0.1.0.** `on_install` and `on_uninstall` are paths to shell scripts inside the plugin directory. The hook executor:

   - Refuses to run hooks unless `trust.level in {official, verified}` in v0.1.0 (closed by default).
   - Sandbox allow-list (Phase 3): read-only filesystem access inside the plugin directory; NO network; NO writes outside the plugin directory; NO privilege escalation; NO fork/exec of binaries not listed in a substrate-maintained allow-list (`sh`, `bash`, `python`, `node`, `cp`, `mv`, `mkdir`, `chmod` — to be ratified before Phase 3 ship).
   - On any sandbox violation: abort the hook, log `hook_sandbox_violation`, surface a one-line stderr notice. The plugin is otherwise installed (hooks are advisory, not load-gating).

   This stance — declare hooks freely; defer execution to Phase 3 — lets language-pack authors ship `on_install` for prompt-cache pre-warming today without us building the sandbox prematurely.

10. **Profile composability decides auto-activation.** A plugin's `neurotypes` array intersects with `profile.identity.neurotypes`:

    - Empty plugin `neurotypes` (or omitted) = neurotype-agnostic → auto-activate.
    - Non-empty intersection = neurotype-targeted match → auto-activate.
    - Empty intersection = installed-but-not-activated; the user can enable it manually via `neurodock plugin enable <name>`.

    For `language-pack` and `translation-pack`, `locale` intersects with the user's interface locale + the locales recorded in `mcp-translation` requests. A language-pack with `locale: ["en-IE"]` activates for an en-IE user; for an en-US user it installs but does not shadow defaults.

    Profile remains the single consent surface — there is no per-plugin consent store. Plugin behaviour follows profile settings.

### Cross-cutting alignment with prior ADRs

- **Round-trip preservation** (ADR 0004): YAML write paths use comment-preserving libraries (`ruamel.yaml` in Python; equivalent in TS). Read paths may use simpler libraries.
- **Versioning posture** (ADR 0001, 0002, 0003): patch and minor bumps within v0.1.x MUST be additive-only. Renames, value removals, required-field additions are major bumps and ship at `/v1.0.0/...`.
- **Vendor neutrality** (ADR 0002 §8, ADR 0005 §2): nothing in the manifest implies a specific LLM vendor. Plugins of `type: mcp-server` MUST NOT bundle vendor SDKs; that is enforced by the MCP-server-builder, not by this schema.
- **Structured errors, never silent** (ADR 0001 cross-cutting): every loader failure has a structured error code (`unknown_plugin_type`, `plugin_requirement_cycle`, `license_not_allowed`, `path_sandbox_violation`, `hook_sandbox_violation`, `signature_invalid`).

## Consequences

### Positive

- **One shape across six plugin types.** Skills, MCP servers, profiles, translation packs, language packs, and themes all use the same manifest. Contributors learn one format.
- **Works for the federated registry without depending on it.** Filesystem discovery is the primary mechanism; the registry indexes the same manifests. Air-gapped installs work identically to networked ones.
- **License boundary is structurally protected.** No plugin can ship with a non-AGPL-compatible license without the substrate refusing it loudly. License posture cannot drift through neglect.
- **Trust ladder degrades gracefully.** `official` and `verified` install without prompting once verification ships; `community` is prompt-and-remember; `experimental` is opt-in per session. Users with different risk tolerances configure their profile and the substrate respects it.
- **Forward-compat parity with the profile schema.** Same `additionalProperties: true` everywhere, same round-trip preservation rule, same loader behaviour on unknown values. Contributors who learned one schema can predict the other.

### Negative

- **Contributors learn one more manifest.** SKILL.md, profile.yaml, plugin.yaml. Mitigation: in-tree first-party skills do NOT need plugin.yaml; the SKILL.md frontmatter is enough for them. plugin.yaml is the contract for out-of-tree plugins.
- **v0.1.0 ships without marketplace UI.** Discovery is filesystem-only; users find plugins by reading the docs site. The federated registry at `plugins.neurodock.org` lands in Phase 3.
- **Signature verification is deferred.** v0.1.0 stores signatures but does not verify them. Until Phase 3, `official` and `verified` effectively mean "lives in a Maintainer-curated location" rather than "cryptographically attested." We document this clearly.
- **The SPDX whitelist will need maintenance.** Each addition is an ADR. We accept the friction as a feature: it forces the maintainer to think about license policy explicitly rather than absorbing whatever SPDX adds.
- **Hook sandbox is non-trivial Phase 3 work.** The allow-list is sketched here but not implemented. The risk is that a plugin author writes a hook expecting it to run in v0.1.0 and discovers it does not. Mitigation: the schema is explicit that hooks are ignored unless trust level is official/verified in v0.1.0; the contributor README repeats the warning.

## Open questions

1. **Signing key management for `verified` plugins.** Two clean positions:

   - **Maintainer-issued keys.** the maintainer generates keys for verified contributors; revocation is centralised.
   - **Per-author keys, Maintainer-curated keyring.** Authors generate their own keys; the maintainer keyring lists fingerprints; revocation is by removing the fingerprint.

   Recommended: **per-author keys with Maintainer-curated keyring** because it scales without the maintainer holding signing material. Maintainer to ratify before Phase 3.

2. **Plugin update mechanics.** Three credible positions:

   - **User-driven.** `neurodock plugin update <name>` fetches the new version.
   - **Substrate-driven, opt-in.** A background check on substrate start; user prompted to update.
   - **Substrate-driven, automatic for `official`/`verified`.** Auto-update without prompt for Maintainer-published plugins.

   Recommended: **user-driven in v0.1.0; opt-in substrate-driven in Phase 3.** Automatic updates without prompt are off the table — they conflict with the local-first manifesto.

3. **Marketplace governance.** Who reviews submissions to `plugins.neurodock.org`? The federated-registry design implies decentralisation, but in practice the registry is operated by the project. Position to confirm: registry indexing is opt-in for plugin authors and curation-free at v0.1.0; the registry surfaces every signed `community` plugin but does not vouch for them.

4. **Should `theme` ship in v0.1.0 or defer?** Plan.md §5 lists five types; this ADR adds a sixth. Two positions:

   - **Ship `theme` in v0.1.0** (current decision): `design-system-keeper` already needs the format; we lose nothing by reserving it.
   - **Defer to v0.2.0**: keep v0.1.0 to plan.md's five types; add `theme` when `design-system-keeper` actually needs it.

   Recommended: **ship in v0.1.0.** Adding a type later is forward-compat, but the schema is cleaner if it lists the value now rather than reserving "and one more we haven't named yet."

5. **`extends` for plugins.** ADR 0004 introduced `extends:` for profiles. Should plugins inherit from a base manifest? Position: **no in v0.1.0.** Plugin manifests are short; inheritance buys little and complicates loader semantics. Revisit only if a clear inheritance pattern emerges from real plugin authoring.

6. **Cross-package version coupling at `requires.substrate_version`.** A plugin pinning `substrate_version: ">=0.1.0 <0.2.0"` will refuse to load against v0.2.0. The forward-compat philosophy says the user should be able to upgrade the substrate without re-pinning every plugin. Position to confirm: substrate v0.x bumps are minor when additive-only (matching the ADR 0004 rule), so `substrate_version: ">=0.1.0"` is the correct shape for almost every plugin and the upper bound should be an exception, not a default.

## Cross-cutting concerns for the maintainer

- **The forward-compat rule is now load-bearing across two schemas.** Profile (ADR 0004) and plugin (this ADR) both rely on `additionalProperties: true` + loader-preserves-unknown-keys. Maintainer should ratify "permissive parsing with round-trip preservation" as substrate-wide doctrine for every YAML or JSON manifest NeuroDock owns. Same rule will likely apply to the eval-corpus dataset cards and the language-pack overrides.
- **The license whitelist is a Maintainer-level policy decision.** The list shipped here is conservative and defensible, but every future addition is the maintainer saying "this license is compatible enough with the project's AGPL posture." That is not an mcp-architect decision; it is governance. Recommend codifying the addition process in `GOVERNANCE.md`.
- **The trust ladder commits the maintainer to operating a keyring.** Once `verified` ships in Phase 3, the maintainer must accept signing-key submissions, decide revocation criteria, and publish the keyring. This is real ongoing work. Surface it now so it is not a Phase 3 surprise.
- **Hook sandboxing is real engineering work.** The Phase 3 sandbox needs to handle Windows + macOS + Linux + the WSL edge case where path separators differ. The allow-list of executables varies per platform. This is several weeks for `mcp-server-builder` + a security review. Pre-allocate the time or descope `hooks` to "documented but never executed" in v0.1.0.
- **Language packs (and translation packs) are eval-coupled.** A `language-prompt-override` for `mcp-translation` shadows a default prompt that has eval coverage. The override gets the same coverage requirement: an `en-IE`-tuned `translate_incoming` prompt MUST run the `packages/evals/corpora/translation/incoming/en-IE/` slice in CI before merge. ADR 0005 §4 already binds this; the maintainer should confirm that the eval-curator owns gating these PRs.

## Notes for downstream consumers

- The schema's `$id` (`https://schemas.neurodock.org/plugin/v0.1.0/plugin.schema.json`) is the stable reference identifier even before that URL serves content. Loaders MAY validate against the local file at `packages/core/schemas/plugin.schema.json`; the `$id` is what changes when the schema bumps.
- Patch and minor bumps within v0.1.x MUST be additive-only: new optional fields, new enum values (new plugin types, new asset sub-types, new license whitelist entries, new trust levels), relaxed constraints. Any field rename, enum-value removal, or required-field addition is a major bump.
- The TS type for the manifest lives in `@neurodock/core` and SHOULD be derived from the schema rather than hand-written. Same for the Python `pydantic` model.
- In-tree first-party skills under `packages/skills/<name>/` do NOT require a `plugin.yaml`; SKILL.md frontmatter is sufficient. Out-of-tree plugins of `type: skill` require BOTH a `plugin.yaml` (for the substrate's discovery and trust/license metadata) AND a SKILL.md (for the skill loader). The contributor README explains the distinction.
- The skill SDKs (`@neurodock/skill-sdk`, `neurodock-skill`) MUST expose a helper that resolves a plugin's effective activation state against the user's profile, so individual skills do not re-derive the intersection logic.

## Notes for `mcp-server-builder` (implementation, deferred)

- Discovery walker: scan `<repo>/plugins/*/plugin.yaml` and `$XDG_DATA_HOME/neurodock/plugins/*/plugin.yaml` (with platform fallbacks). Validate each against `plugin.schema.json`. Build the dependency graph; reject cycles via Tarjan's SCC.
- License gate: BEFORE activating any plugin, check `license` against the whitelist. Refuse with `license_not_allowed` on miss.
- Path sandbox: normalise every `provides[].path` and `hooks.*`; reject any path that escapes the plugin directory.
- Profile intersection: compute auto-activation per the algorithm in decision 10. Surface "installed but not activated" plugins in `neurodock plugin list`.
- Round-trip preservation: read with permissive YAML; write with comment-preserving YAML. Preserve unknown keys at every nesting level.
- Structured errors: never swallow a load failure. Every refusal is a logged event with a stable error code.

## Notes for `community-triage` and `doc-writer`

- The contributor-facing README at `plugins/README.md` (updated in the same PR as this ADR) is the entry-point doc; it covers the minimal manifest, the trust ladder, the license whitelist, and the path sandbox.
- The long-form contributor guide (the "how to author each of the six plugin types" walk-through) is `doc-writer`'s scope and is scheduled for a later wave.
- Community-triage's plugin-PR triage checklist should include: schema validation pass, license-whitelist hit, `description` does not make clinical claims, assigned when `neurotypes` is non-empty.
