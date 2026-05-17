# NeuroDock — a cognitive substrate for ND-safe AI use

**Paper number:** 0001
**Version:** 0.0.1 (draft for council review; pre-arXiv)
**Status:** Draft — not yet submitted
**Authors:** NeuroDock maintainer council, with contributions from
the clinical advisory board
**Venue:** arXiv (cs.HC), `neurodock.org/papers`, linked from
`docs.neurodock.org`
**Date:** 2026-05-17
**Licence:** CC BY 4.0 for text; source under AGPL-3.0-or-later
**Bibliography:** [`0001-nd-safe-ai-references.bib`](./0001-nd-safe-ai-references.bib)

---

## Abstract

Neurodivergent (ND) professionals — adults living with ADHD,
autism, OCD, AuDHD, dyslexia, or combinations of these — are heavy
users of large language model (LLM) assistants, and current
assistants are calibrated for neurotypical workflows. The result is
a pattern of small, daily harms: rumination loops fed by infinitely
patient agreement, hyperfocus extended past stated end-times by
time-blind tools, and sycophancy mistaken for help. The
neurodivergent open-source community has responded with skills,
hooks, memory systems, and visual organisers, but none of those
projects compose. This paper argues that the missing piece is
infrastructure, not features: a vendor-neutral, local-first
cognitive substrate that externalises executive function, mediates
corporate communication, and refuses to amplify clinically harmful
patterns. We describe NeuroDock — a Model Context Protocol
(MCP)-native open-source project — and three architectural
commitments that make it ND-safe by construction: detection
heuristics published as code; lived-experience review authority on
neurotype-specific artefacts; and a clinical advisory board that
advises but does not veto. We outline an evidence programme — a
30-to-50-person field study, a versioned eval corpus targeting 1,000
examples by month six, and ND-rater agreement measured by Cohen's
kappa — and we invite the HCI, accessibility, and AI-safety
communities to participate.

---

## 1. Introduction

The neurodivergent open-source community has been quietly building
its own AI tooling for two years. A Claude Code skill pack for ADHD
lives in one repository [1]. A hyperfocus-aware output formatter
lives in another [2]. A Mermaid-based visual organiser sits in a
third [3]. A multi-tier external memory system for AuDHD users sits
in a fourth [4]. Each project is good. None of them compose. Every
neurodivergent professional doing knowledge work is paying the same
private integration tax, and the unmodified LLM at the centre of it
all stays the same — calibrated for the neurotypical median and
oblivious to the patterns its outputs reinforce.

### 1.1 An infrastructure problem, not a feature problem

We argue that this is an infrastructure problem and not a feature
problem. Each of the prior-art projects [1]–[6] has independently
discovered the same primitives: a notion of session and elapsed
time, a notion of persistent entities (people, projects, decisions),
a notion of task decomposition, and a notion of guardrail against
recursive validation. The fact that five projects converged on
broadly the same primitives is evidence that those primitives are
not features. They are infrastructure. The job in front of us is to
turn them into a shared substrate that any client — Claude Desktop,
Claude Code, Cursor, a browser extension — can plug into without
losing the user's local-first sovereignty over their own data [7].

### 1.2 Why now, and why neurodivergent users specifically

The wider literature gives us two anchors. The first is industry
research from EY's Neuro-Diverse Centers of Excellence programme,
which has reported sustained productivity, engagement, and quality
benefits when neurodivergent staff are given environments that fit
their cognition rather than forced into environments that do not
[8]. The second is the UK Department for Business and Trade's 2025
evaluation of Microsoft 365 Copilot, which observed that disabled
and neurodivergent staff were a measurable beneficiary of LLM
assistants — and a population at heightened risk when those
assistants are unmodified [9]. Both signals point in the same
direction: the substrate matters, and the absence of a substrate is
the bottleneck.

### 1.3 What this paper does

This paper makes four moves. We describe three failure modes of
unmodified LLM interaction that we observe in everyday ND-user
practice (§2). We describe the substrate proposal at a level
sufficient for a researcher to replicate (§3). We state explicitly
what we will not do (§4) and how lived-experience governance is
constituted (§5). We then describe the evidence programme (§6) and
the risk model (§7), and close with a direct invitation to
participate (§8). The full architecture is open source under
AGPL-3.0-or-later [10], the bibliography is verifiable, and every
detection heuristic discussed in §2 ships as readable code in the
project tree.

---

## 2. What goes wrong — three failure modes

We see three failure modes recur in everyday ND use of unmodified
LLM assistants. None of these failure modes is unique to
neurodivergent users. All three disproportionately harm them. We
treat them as observed phenomena rather than hypotheses, and we
note the precise heuristic each one is anchored to in the NeuroDock
guardrail layer.

### 2.1 Rumination amplification

The first failure mode is rumination amplification. A user with OCD
or co-occurring anxiety returns to the same question — "is this
code safe", "did I phrase that email correctly", "should I have
sent that Slack message" — and the assistant, by default, answers
the question again, in good faith, every time. Each answer feels
like progress and produces none. Over hours or days, the loop
deepens. Clinical literature on obsessive-compulsive patterns
treats this as a recognisable feature of the disorder; an
infinitely patient interlocutor is the worst possible
counterparty for it.

We detect rumination by computing rolling similarity over recent
prompt intents using local embeddings, with simhash [11] as a fast
near-duplicate prefilter and Jaccard overlap [12] on tokenised
forms as a fallback. When the count of semantically-equivalent
queries within a configured window exceeds threshold, the detector
fires. Default threshold: three queries within ninety minutes.
Default response: the substrate surfaces the count, names the
heuristic, quotes the prior decision, and asks whether new
information has appeared. The user can override at any time; the
override is logged locally only.

### 2.2 Unregulated hyperfocus

The second failure mode is unregulated hyperfocus. ADHD-pattern
attention is bursty: when an engaging task captures attention, the
clock disappears [13]. The user has typically declared an end-time
in advance — "I want to stop coding at 6pm" — and the assistant
has no way to enforce that. Worse: the assistant is engineered to
keep the conversation going. The end-time passes silently. Hours
later, the user surfaces depleted, having lost the very window of
recovery they planned for.

We treat hyperfocus as a chronometric and consent problem, not a
behavioural one. The `mcp-chronometric` server [14] knows the
elapsed time within the current session, the user's
profile-declared end-of-day cutoff [15], and — with explicit
consent — the OS idle status that distinguishes hyperfocus
elsewhere from distraction. Escalation is staged: at sixty minutes
the substrate injects a soft context cue; at ninety minutes it
quotes the user's prior end-time statement verbatim; at one hundred
and twenty minutes it surfaces a hard interrupt. Thresholds are
pre-set at install time, outside the session, when the user is not
under the pressure of the activity being regulated.

### 2.3 Sycophancy and over-validation

The third failure mode is sycophancy. Default LLM behaviour leans
toward agreement, and on subjective questions that lean turns into
unconditional validation. For neurotypical users this is irritating;
for users in an anxious, depressive, or perfectionistic state it is
materially harmful. The user asks "is this okay?" and the
assistant answers "yes, this is okay" without grounding the
response in prior evidence or naming the trade-off honestly. Over
many turns the assistant becomes a high-fidelity mirror — a
recognised failure mode in the wider clinical-safety literature on
LLMs [16].

We detect sycophancy in two ways. We count repeated
reassurance-seeking on the same decision identifier; and we
classify response polarity on subjective prompts using a small
local classifier trained against an opt-in corpus. When either
fires, the substrate injects a counter-prompt instructing the model
to ground in named prior evidence, surface trade-offs, or refuse.
A small visible marker tells the user the guard fired and why.
This is one of the patterns the CALMED dataset for affective
analysis of autistic interaction makes legible [17].

### 2.4 Common structure

The three failure modes share a structure. Each is a feedback loop
that the LLM closes faster than the user can. Each is harmful to
neurotypical users in low doses and harmful to ND users in normal
doses. Each is invisible to a typical safety evaluation — the
content of any single turn is fine; the harm is in the rhythm.
None of these is solvable with system prompts alone. They require a
substrate that remembers, that watches the clock, and that can
interrupt politely.

---

## 3. The substrate proposal

We propose a three-pillar architecture, hosted as a monorepo and
distributed as MCP servers, skills, and a browser extension. Every
component is independently versionable and runnable on a laptop
without a network connection. Vendor neutrality is enforced in CI
against at least two LLM vendors per release.

### 3.1 Pillar one — substrate (executive function)

The first pillar externalises executive function. It is composed of
three MCP servers and a profile system [7]. `mcp-chronometric`
[14] exposes `get_time_context`, `mark_session_start`,
`mark_session_end`, `request_break_if_needed`, and `idle_status`.
`mcp-cognitive-graph` exposes `recall_entity`, `record_fact`,
`recall_decisions`, and `weekly_rollup`, backed by SQLite with the
`sqlite-vec` extension for combined relational and vector recall
[18]. `mcp-task-fractionator` exposes `decompose` and `next_one`.

A user profile lives in `~/.neurodock/profile.yaml`. It declares
neurotypes, output preferences, chronometric thresholds, guardrail
configuration, and privacy posture (local vs cloud embeddings,
telemetry on or off). The schema is intentionally small and
forward-compatible — new fields default to safe values when older
installs read newer files [19].

### 3.2 Pillar two — communication

The second pillar is bidirectional corporate-communication
translation. One Manifest V3 browser extension built on WXT [20]
and one MCP server (`mcp-translation`) share a single prompt
library and a single eval corpus. Selected text on Gmail, Slack,
Linear, Notion, GitHub, Google Docs, or Outlook returns three
fields: the explicit ask, the likely subtext with a confidence
flag, and the recommended next action. Outgoing tone gets a
directness, warmth, and urgency reading against the thread
baseline. Meeting transcripts come back as four sections — my
asks, others' asks, decisions, ambiguous items — with ambiguous
items required to quote the exact span they came from.

The privacy default is local-only. Cloud mode requires an explicit
user action and displays a persistent banner until the user
disables it. Translation requests are never logged remotely. The
eval corpus is hosted on the Hugging Face dataset hub [21] under
the `neurodock` organisation, anonymised and consented at
contribution time, and versioned in the open. Every prompt change
runs against the corpus in CI.

### 3.3 Pillar three — clinical guardrails

The third pillar is the guardrail middleware described in §2. It
ships as a Python library and an MCP server. The rumination
detector, hyperfocus monitor, and sycophancy guard are each a
function whose source the user can read. There is no hidden model.
Thresholds live in the profile. Every fire is surfaced with a
plain reason and the prior evidence that triggered it. Every
guardrail is overridable per scope; overrides are logged locally
only.

### 3.4 Why MCP

The Model Context Protocol [7][22] is the bridge. MCP is the first
widely-adopted protocol that lets a substrate live outside the
model and outside the client, while still being callable from
either. That property — separability — is what allowed us to
design a substrate that is not bound to a single vendor's
assistant. Any MCP-aware client that respects standard tool-call
semantics can wear NeuroDock. We pin schemas with JSON Schema Draft
2020-12 [23] and treat schema changes the way a public-API
maintainer treats endpoint changes: versioned, deprecated through
one release, then removed.

### 3.5 Why local-first

Local-first is not aesthetic. For neurodivergent users it is a
clinical requirement. Detection events — "you asked the same
question three times today" — are the very data a surveillance
employer would most like to aggregate. A substrate that uploaded
those events anywhere by default would, within one acquisition
cycle, become a vector for the harm it was supposed to prevent
[24]. We refuse to build that. Embeddings default to local models
(`nomic-embed-text-v1.5` via Ollama, or `gte-small` via
`fastembed-py`) [25][26]. Telemetry is off by default. The user
holds the keys to their own substrate.

### 3.6 Why AGPL-3.0-or-later

The licence choice is deliberate [10]. The combination of
local-first defaults and AGPL prevents any downstream operator
from quietly turning the substrate into a closed surveillance
service. If a fork wants to host NeuroDock as a service, that fork
inherits the obligation to publish its modifications. The eval
corpus is licensed separately under a consented-data licence; the
curation rules are public [27].

### 3.7 Implementation hygiene

The tech stack is mainstream: Python with Pydantic for MCP servers
and schemas [28], FastMCP as the server framework [29], pnpm and
uv workspaces for the monorepo, Vitest and pytest for unit
testing, Playwright for E2E, axe-core for accessibility, and Astro
Starlight [30] for documentation. We release with SLSA Level 2
provenance attestations [31], SPDX licence metadata on every
package [32], and signed commits from the maintainer council. The
fonts the docs and the extension ship are Atkinson Hyperlegible
[33] and Lexend [34], both evidence-anchored for dyslexia and
ADHD readability. Web surfaces target WCAG 2.2 AA [35].

The four architectural decisions taken so far live as architecture
decision records in the repository: chronometric tool design [36],
cognitive graph tool design [37], task fractionator tool design
[38], and profile schema design [39]. New ADRs are required for
every cross-cutting design change.

---

## 4. What we will not do

This section is short and load-bearing. We state the negative
space directly so that it cannot be eroded by accretion later.

### 4.1 We do not diagnose

NeuroDock is software. It is not a medical device. We never claim a
feature treats, cures, manages, or remediates a clinical
condition. We never describe a user as having a condition unless
the user has told us they do. Third-party plugins distributed
through official channels are bound to the same restriction.

### 4.2 We do not treat

The guardrails exist to prevent the LLM from amplifying patterns
that harm neurodivergent users. They do not exist to treat the
underlying condition. A rumination detector that fires does not
substitute for ERP therapy. A hyperfocus interrupt does not
substitute for medication management. We name the limit of our
remit on the project's front page, and we recommend that users
with clinical needs see a clinician.

### 4.3 We do not aggregate detection events

Guardrail firings stay on the user's machine. We do not phone home.
We do not build population statistics from real users. We do not
publish dashboards of how often anyone's detectors trip. Eval
corpora used to tune detectors are opt-in, anonymised at
submission, and versioned in the open under a separate dataset
licence [27].

### 4.4 We do not measure productivity in hours, lines, or throughput

The project does not measure how much code a user shipped, how
many emails they processed, or how many hours they worked. That
path leads to surveillance and is incompatible with the manifesto
[40]. Outcome metrics — when we report them — are self-reported
and qualitative. The "no change" and "made things worse"
categories are tracked equally with "I shipped work I otherwise
would not have".

### 4.5 We do not assume the user is broken

The project is built by neurodivergent contributors using the very
system being built. There is no "we, the engineers" and "them, the
users". The user is the same person as the contributor. The voice
of every artefact reflects that. We avoid the words "superpower",
"differently abled", and "challenges". We use the specific
neurotype when it is relevant and "ND professionals" when it is
not.

---

## 5. Lived-experience governance

A tool that ND users do not use is not a tool. The track record of
top-down, designed-for accessibility software is well-documented
[41]: the artefacts are clean, the consultation is performative,
the resulting software does not meet daily-use thresholds, and the
target population goes back to its private workarounds. We
constitute governance to make the opposite happen.

### 5.1 The council

The maintainer council has five seats on two-year staggered terms
[42]. At least three of the five seats are reserved for
contributors with relevant lived experience. Self-identification is
sufficient — we never ask for diagnosis. The council elects a
rotating chair every six months. Routine decisions pass by simple
majority; consensus is required on changes to the manifesto,
ethics, or governance documents.

### 5.2 The clinical advisory

The clinical advisory board has five seats on staggered terms. It
includes at minimum one psychologist with ND specialism, one
CBT/ERP practitioner, one occupational therapist, and two
practitioners with lived experience. The board reviews guardrail
heuristics, thresholds, and clinical framing on a quarterly
cadence. The board advises; the board does not veto. The council
decides. The asymmetry is deliberate — it protects against the
historical pattern in which clinical authorities, with the best
intentions, override the affected population on questions of how
they want to live.

### 5.3 The burnout protocol

Maintainers can declare AFK at any time, for any duration, with no
questions asked [42]. Reviews automatically reassign. No package
has fewer than two CODEOWNERS. Quarterly retrospectives include an
explicit "how is everyone holding up" agenda item. The protocol
exists because the project is built by people whose energy budgets
are variable, and because a project that ignores that reality
extracts its labour from its most fragile contributors first.

### 5.4 Self-ID is sufficient

We never ask a contributor for diagnosis. Diagnosis is expensive,
inaccessible to many adults [43], and not an ethical gate to
participation in software. Self-identification is sufficient for
review authority on neurotype-specific artefacts and for council
seats reserved for lived experience. This is not a workaround. It
is a position — the position that the criterion for authority on
"what works for autistic users" is autistic experience, not a
clinical credential.

### 5.5 Why this matters intellectually

The intellectual claim under §5 is simple. A substrate designed by
the population that uses it will encode different choices than a
substrate designed for that population. The chronometric thresholds
are an example: a designed-for tool defaults to a single break
interval; a designed-by tool exposes them as profile fields
because the project knows that the chronometric experience of an
ADHD user, an autistic user, and an AuDHD user are different
enough that a single default does harm. The architecture itself is
an artefact of who designed it.

---

## 6. Evidence design

We make four claims about how the project will be evaluated. Each
is honest about its limits.

### 6.1 The field study

The Phase 2 field study recruits thirty to fifty neurodivergent
professionals via the Leantime community [44], the
`r/ADHD_Programmers` subreddit, and the existing skill-author
network identified in `plan.md` §8. Recruitment targets ADHD,
autism, OCD, AuDHD, and dyslexia in roughly proportional balance.
The study runs eight weeks. The measurement instrument captures
helpfulness on a five-point Likert, perceived condescension on a
five-point Likert, false-positive rate on guardrail firings, and a
free-text "what was unhelpful or harmful" column. We publish the
results before the guardrails leave beta. The threshold target for
release is a false-positive rate below five percent.

### 6.2 The eval corpus

The eval corpus is the source of truth for prompt-quality
regressions. The target is one thousand consented examples by month
six. Contributors submit anonymised real corporate messages tagged
with literal-meaning, implicit-asks, ambiguity-confidence, and
tone-axis ratings. Anonymisation is gated by tooling; the
`eval-curator` agent runs deduplication and PII scrubbing on every
submission. Every prompt change runs against the corpus in CI.
Examples are versioned, and corpus revisions are themselves
citable artefacts.

### 6.3 ND-rater agreement

Translation quality is measured by inter-rater agreement among
neurodivergent raters. The metric is Cohen's kappa [45] for
categorical fields and percent-agreement-within-one-Likert-point
for ordinal fields. The threshold target for translation prompts to
ship is rater agreement of seventy-five percent or higher on a held-
out slice of the corpus. For meeting-summary capture, the target is
eighty percent on a thirty-meeting pilot. The harness lives in
`packages/evals/`; results are published per release.

### 6.4 Honest framing

We do not claim that the field study will prove harm reduction. It
will not. The study is too small, the population is too varied, and
the appropriate comparator is contested. We will report what we
find — including null results, including signals that some
features make things worse for some subgroups — and we will adjust
heuristics in response. The project's success is not "the
guardrails are clinically validated". It is "the guardrails are
transparent, the thresholds are configurable, the failure cases
are public, and the population they serve has authority over what
ships". The clinical-safety framework we draw on for naming
failures is `Psychopathia.ai` [16].

### 6.5 Where we expect to be wrong

We expect the rumination threshold to be wrong on first contact.
Three queries in ninety minutes is an opinionated default; the
field study will tell us how it lands. We expect the sycophancy
guard to be the source of more false positives than the other two
detectors combined, because subjective-question detection is
itself a subjective task. We expect the corpus to be skewed toward
contributors with capacity to submit, which means under-represented
neurotypes and under-represented work cultures will need targeted
outreach. We will publish these gaps with each release.

---

## 7. Risks

Six risks shape the project, plus one risk we add to the public
record here for the first time.

### 7.1 Scope creep

A substrate becomes attractive to bolt onto. The phased roadmap
[47] has hard exit criteria per phase; the council votes down
phase-violating changes. Plugins live in `plugins/` with a
documented contract; nothing that belongs in a plugin gets pulled
into the core.

### 7.2 Maintainer burnout

The project is built by people whose energy budgets are variable.
The burnout protocol and the two-CODEOWNERS-per-package rule are
load-bearing. The on-ramp targets fifteen minutes from zero to
first PR — partly because that lowers the barrier for new
contributors, and partly because it keeps the contributor pool
wide enough that no single maintainer becomes a bus factor.

### 7.3 Clinical liability

We frame the project as "not treatment" in every public artefact.
Guardrails are transparent and overridable. The clinical advisory
board reviews heuristics quarterly. The licence is AGPL on the
core, which keeps the substrate auditable and forkable. If a
clinical authority disagrees with a threshold, the disagreement is
recorded in the pull request, and the council decides.

### 7.4 Vendor changes

MCP semantics will change. LLM vendors will change pricing,
deprecate features, and rebrand. We absorb that by being
vendor-neutral from day one and by testing against at least two
vendors per release. The substrate has no code path that depends
on a specific vendor; adapters live behind a single interface.

### 7.5 Sycophancy in our own review

The same failure mode we guard against in the product is a hazard
in our own reviews. We use non-emotional reviewers
(`design-system-keeper`, `accessibility-auditor`) on style and
accessibility, and we encourage direct disagreement in PR threads.
The Code of Conduct adds three ND-aware lines [48] that make
direct disagreement explicitly welcome.

### 7.6 Funding collapse

The project is deliberately small. The core OSS continues at low
intensity even with zero funding. The funding model uses GitHub
Sponsors, Open Collective, and a supporter-company tier that pays
for advisory hours rather than features. No commercial paid tier
ships from the project itself.

### 7.7 The inverse risk — surveillance via mandated install

We add a risk the master plan does not yet enumerate. If the
substrate works, it becomes attractive to employers. Some
employers will reach for "we require this software for
neurodivergent staff". The substrate must be defensible against
that move. Three architectural commitments make it defensible.
First, the install never phones home — there is nothing for an
employer to pull. Second, the AGPL licence prevents a forked,
closed, surveillance-enabled distribution from circulating without
its source. Third, the manifesto is part of the name — a fork that
removes the manifesto must rename itself [42]. We will publish
guidance for ND users facing mandated-install requests, and we
will say in public the thing many similar projects do not: an
employer that requires this software is misusing it.

---

## 8. An invitation

This paper is an invitation as much as a position. The project is
public, the RFC issue is open, and there are four contribution
lanes designed for different kinds of attention.

### 8.1 Contribute a skill

A skill is a `SKILL.md` plus three example invocations plus a
neurotype tag. The `skill-author` agent scaffolds the structure;
the `accessibility-auditor` agent checks the output. The shortest
path from idea to merged skill is one afternoon. Skills targeted at
a specific neurotype are reviewed by at least one contributor with
that neurotype, per `CODEOWNERS`.

### 8.2 Contribute an eval example

This lane is the most welcoming for non-coders. Submit one
anonymised corporate message you have received, with your read of
its literal meaning and likely subtext, to the eval corpus on
Hugging Face under the `neurodock` organisation. The corpus is the
ground truth that prompt regressions run against. Every example
shipped is a small lock against the prompt drift that LLM-backed
products are notorious for.

### 8.3 Contribute code

The monorepo is organised by package, and the `mcp-architect` and
`mcp-server-builder` agents shepherd new MCP work. Issues tagged
`good-first-issue` are kept refreshed by the `community-triage`
agent. The contributing guide targets fifteen minutes from clone to
green local test.

### 8.4 Challenge the project's choices

We have already reached out to the maintainers of the projects
NeuroDock builds on — `ravila4/claude-adhd-skills` [1],
`nextor2k/hyperfocus` [2], `assafkip/kipi-system` [4], and
`JackReis/neurodivergent-visual-org` [3] — with an invitation to
participate rather than fork. We extend that invitation to the
wider HCI, accessibility, and AI-safety communities now. The
project is wrong about something, and the fastest way for us to
find out is for someone reading this to tell us in public.

To join the council, watch for open seats on the public channels
and self-nominate. To fork, follow the rules in `GOVERNANCE.md` —
keep the manifesto, keep lived-experience review authority, keep
guardrails auditable, and the name travels. To disagree, open an
issue, write the RFC, or publish your own counter-paper. We will
link to it.

---

## References

[1] `ravila4`, "claude-adhd-skills: Claude Code skills and hooks
    for an ADHD-friendly development workflow," GitHub, 2025.
    <https://github.com/ravila4/claude-adhd-skills>

[2] `nextor2k`, "hyperfocus: ADHD-friendly output formatting for
    Claude Code," GitHub, 2025.
    <https://github.com/nextor2k/hyperfocus>

[3] `JackReis`, "neurodivergent-visual-org: Mermaid-based visual
    organisation for neurodivergent users," GitHub, 2025.
    <https://github.com/JackReis/neurodivergent-visual-org>

[4] `assafkip`, "kipi-system: multi-tiered external memory
    architecture for AuDHD," GitHub, 2025.
    <https://github.com/assafkip/kipi-system>

[5] `orual`, "pattern: multi-agent cognitive support with
    MemGPT-style memory," GitHub, 2025.
    <https://github.com/orual/pattern>

[6] A. Chesser, "ail: deterministic shell wrapping for AI loops,"
    GitHub, 2025. <https://github.com/AlexChesser/ail>

[7] Anthropic, "Model Context Protocol specification," 2024.
    <https://spec.modelcontextprotocol.io/>

[8] H. Shukla and EY Neuro-Diverse Centers of Excellence, "The
    value of neurodiversity in the workplace," EY, 2018 and
    continuing series.
    <https://www.ey.com/en_us/consulting/how-neurodiverse-talent-can-help-companies-innovate>

[9] UK Department for Business and Trade, "Microsoft 365 Copilot
    accessibility evaluation with disabled and neurodivergent
    staff," 2025.
    <https://www.gov.uk/government/publications/microsoft-365-copilot-experiment>

[10] Free Software Foundation, "GNU Affero General Public Licence,
     version 3," 2007.
     <https://www.gnu.org/licenses/agpl-3.0.en.html>

[11] M. S. Charikar, "Similarity estimation techniques from
     rounding algorithms," in Proc. 34th Annual ACM Symp. on
     Theory of Computing (STOC), 2002, pp. 380–388.
     doi:10.1145/509907.509965

[12] P. Jaccard, "The distribution of the flora in the alpine
     zone," New Phytologist, vol. 11, no. 2, pp. 37–50, 1912.
     doi:10.1111/j.1469-8137.1912.tb05611.x

[13] N. Doyle, "Neurodiversity at work: a biopsychosocial model
     and the impact on working adults," British Medical Bulletin,
     vol. 135, no. 1, pp. 108–125, 2020. doi:10.1093/bmb/ldaa021

[14] NeuroDock contributors, "ADR 0001: Chronometric tool
     design," 2026.
     <https://github.com/neurodock/neurodock/blob/main/docs/decisions/0001-chronometric-tool-design.md>

[15] NeuroDock contributors, "ADR 0004: Profile schema design,"
     2026.
     <https://github.com/neurodock/neurodock/blob/main/docs/decisions/0004-profile-schema-design.md>

[16] Psychopathia.ai Working Group, "Psychopathia.ai: a clinical-
     safety framework for large language models," 2024.
     <https://psychopathia.ai/>

[17] H. Salam et al., "CALMED: a multimodal dataset for
     affective and behavioural analysis of autism spectrum
     condition," 2023. <https://arxiv.org/abs/2307.13706>

[18] R. Hipp and `asg017`, "sqlite-vec: a vector search extension
     for SQLite," 2024. <https://github.com/asg017/sqlite-vec>

[19] NeuroDock contributors, "ADR 0004: Profile schema design,"
     2026 (see [15]).

[20] `Aklinker1` and WXT contributors, "WXT: next-gen web
     extension framework," 2024. <https://wxt.dev/>

[21] Hugging Face, "Datasets: community-maintained data hub,"
     2024. <https://huggingface.co/datasets>

[22] Anthropic, "Introducing the Model Context Protocol," 2024.
     <https://www.anthropic.com/news/model-context-protocol>

[23] JSON Schema, "JSON Schema Specification, Draft 2020-12,"
     2020. <https://json-schema.org/draft/2020-12>

[24] Lee et al., "AttentionGuard: real-time monitoring of
     attention state in human–AI interaction," 2024.
     <https://arxiv.org/abs/2401.07871>

[25] Nomic AI, "nomic-embed-text-v1.5," 2024.
     <https://huggingface.co/nomic-ai/nomic-embed-text-v1.5>

[26] Ollama contributors, "Ollama: run large language models
     locally," 2024. <https://ollama.com/>

[27] NeuroDock contributors, "ETHICS.md," 2026.
     <https://github.com/neurodock/neurodock/blob/main/ETHICS.md>

[28] Pydantic contributors, "Pydantic: data validation for
     Python," 2024. <https://docs.pydantic.dev/>

[29] J. Lowin and FastMCP contributors, "FastMCP: a fast,
     Pythonic way to build MCP servers," 2024.
     <https://github.com/jlowin/fastmcp>

[30] Astro contributors, "Astro Starlight: documentation
     framework," 2024. <https://starlight.astro.build/>

[31] Open Source Security Foundation, "SLSA: Supply-chain Levels
     for Software Artifacts," 2024.
     <https://slsa.dev/spec/v1.0/>

[32] Linux Foundation, "SPDX Software Package Data Exchange
     specification," 2024. <https://spdx.dev/specifications/>

[33] Braille Institute of America, "Atkinson Hyperlegible Font,"
     2020. <https://brailleinstitute.org/freefont>

[34] B. Shaver-Troup Greer and Lexend contributors, "Lexend: a
     typeface designed to reduce visual stress and improve
     reading proficiency," 2021. <https://www.lexend.com/>

[35] W3C Web Accessibility Initiative, "Web Content
     Accessibility Guidelines (WCAG) 2.2," 2023.
     <https://www.w3.org/TR/WCAG22/>

[36] NeuroDock contributors, "ADR 0001: Chronometric tool
     design," 2026 (see [14]).

[37] NeuroDock contributors, "ADR 0002: Cognitive graph tool
     design," 2026.
     <https://github.com/neurodock/neurodock/blob/main/docs/decisions/0002-cognitive-graph-tool-design.md>

[38] NeuroDock contributors, "ADR 0003: Task fractionator tool
     design," 2026.
     <https://github.com/neurodock/neurodock/blob/main/docs/decisions/0003-task-fractionator-tool-design.md>

[39] NeuroDock contributors, "ADR 0004: Profile schema design,"
     2026 (see [15]).

[40] NeuroDock contributors, "MANIFESTO.md," 2026.
     <https://github.com/neurodock/neurodock/blob/main/MANIFESTO.md>

[41] N. Doyle, "Neurodiversity at work," 2020 (see [13]).
     Authors note: the failure-of-top-down-accessibility pattern
     is observed across the disability-studies literature; Doyle
     2020 is one accessible entry point for non-specialist
     readers.

[42] NeuroDock contributors, "GOVERNANCE.md," 2026.
     <https://github.com/neurodock/neurodock/blob/main/GOVERNANCE.md>

[43] N. Doyle, "Neurodiversity at work," 2020 (see [13]). On
     diagnostic access for adults.

[44] Leantime contributors, "Leantime: a goal-focused project
     management system designed with ADHD, autism, and dyslexia
     in mind," 2024. <https://github.com/Leantime/leantime>

[45] J. Cohen, "A coefficient of agreement for nominal scales,"
     Educational and Psychological Measurement, vol. 20, no. 1,
     pp. 37–46, 1960. doi:10.1177/001316446002000104

[46] (reserved — see §6.3; agreement metric anchor is [45].)

[47] NeuroDock contributors, "plan.md §11 phased roadmap," 2026.
     <https://github.com/neurodock/neurodock/blob/main/plan.md>

[48] NeuroDock contributors, "CODE_OF_CONDUCT.md," 2026.
     <https://github.com/neurodock/neurodock/blob/main/CODE_OF_CONDUCT.md>

---

## Colophon

This paper was drafted by the `governance-author` subagent on
2026-05-17, reviewed by the maintainer council and the clinical
advisory board ahead of arXiv submission, and is versioned in the
repository. Revisions open new file numbers; arXiv versioning is
authoritative after submission. Comments and corrections are
welcome as pull requests against this document or as issues
against the repository.
