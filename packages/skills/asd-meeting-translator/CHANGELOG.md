# Changelog — asd-meeting-translator

All notable changes to this skill are documented in this file. Format follows Keep a Changelog; the skill is versioned independently from the rest of the monorepo via the `version` field in its SKILL.md frontmatter.

## [Unreleased]

### Added

- Step 6a: fractionate action items via `mcp-task-fractionator`. After the four-section brief is produced, each entry in `output.my_asks` is passed to `mcp-task-fractionator.decompose` and the returned 5–90 minute atomic tasks are appended to the brief under a new `### Atomic tasks from asks of you` section. The step is gated — if the fractionator MCP server is not configured the skill skips silently and the asks remain visible in the original `### Asks of you` section. When `mcp-cognitive-graph` is available the fractionation is persisted as a `fractionated_from` edge so the next session's `weekly_rollup` includes the meeting outputs.
